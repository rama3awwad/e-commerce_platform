import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { EXCHANGES, QUEUES, ROUTING_KEYS, parseRetryDelays, retryQueueName } from './messaging.constants';

export interface Delivery {
  msg: amqp.ConsumeMessage;
  ack(): void;
  nack(requeue: boolean): void;
}
type Handler = (delivery: Delivery) => Promise<void>;
interface ConsumerDef { queue: string; handler: Handler; prefetch: number }

/**
 * اتصال RabbitMQ (Self-hosted) مع إعادة اتصال تلقائية.
 * - الاتصال يجري بالخلفية ولا يمنع إقلاع الـ API.
 * - RABBITMQ_URL غير معرّف => الخدمة معطّلة.
 */
@Injectable()
export class RabbitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitService.name);
  private readonly url?: string;
  readonly retryDelays: number[];
  private conn?: amqp.ChannelModel;
  private pubChannel?: amqp.ConfirmChannel;
  private consumerChannels: amqp.Channel[] = [];
  private readonly consumers: ConsumerDef[] = [];
  private connecting = false;
  private stopped = false;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(config: ConfigService) {
    this.url = config.get<string>('RABBITMQ_URL') || undefined;
    this.retryDelays = parseRetryDelays(config.get<string>('RETRY_DELAYS_MS'));
  }

  onModuleInit() {
    if (!this.url) { this.logger.warn('RABBITMQ_URL is not set: messaging is disabled'); return; }
    void this.connect();
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { await this.conn?.close(); } catch { /* الاتصال مغلق أصلاً */ }
  }

  get isConnected(): boolean { return this.pubChannel !== undefined; }

  /** نشر رسالة دائمة (persistent) وانتظار تأكيد الـ broker (publisher confirm). */
  publish(exchange: string, routingKey: string, payload: unknown, headers: Record<string, unknown> = {}): Promise<void> {
    const channel = this.pubChannel;
    if (!channel) return Promise.reject(new Error('RabbitMQ is not connected'));
    return new Promise<void>((resolve, reject) => {
      channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(payload)),
        { persistent: true, contentType: 'application/json', headers },
        (err) => (err ? reject(err) : resolve()));
    });
  }

  /** تسجيل consumer؛ يبدأ فوراً إن كنا متصلين، وإلا بعد الاتصال (وبعد كل إعادة اتصال). */
  async consume(queue: string, handler: Handler, prefetch = 5): Promise<void> {
    const def: ConsumerDef = { queue, handler, prefetch };
    this.consumers.push(def);
    if (this.conn) await this.startConsumer(def);
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting || !this.url) return;
    this.connecting = true;
    try {
      const conn = await amqp.connect(this.url);
      conn.on('error', (e) => this.logger.error(`RabbitMQ connection error: ${e.message}`));
      conn.on('close', () => {
        this.conn = undefined; this.pubChannel = undefined; this.consumerChannels = [];
        if (!this.stopped) { this.logger.warn('RabbitMQ connection closed'); this.scheduleReconnect(); }
      });
      const channel = await conn.createConfirmChannel();
      channel.on('error', (e) => this.logger.error(`RabbitMQ channel error: ${e.message}`));
      await this.assertTopology(channel);
      this.conn = conn; this.pubChannel = channel;
      for (const def of this.consumers) await this.startConsumer(def);
      this.logger.log('RabbitMQ connected');
    } catch (e) {
      this.logger.error(`RabbitMQ connect failed: ${(e as Error).message}`);
      this.scheduleReconnect();
    } finally { this.connecting = false; }
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; void this.connect(); }, 5000);
  }

  private async assertTopology(ch: amqp.Channel) {
    await ch.assertExchange(EXCHANGES.ORDERS, 'topic', { durable: true });
    await ch.assertQueue(QUEUES.EMAIL, { durable: true });
    await ch.bindQueue(QUEUES.EMAIL, EXCHANGES.ORDERS, ROUTING_KEYS.ORDER_CREATED);
    await ch.assertQueue(QUEUES.EMAIL_DLQ, { durable: true });
    // طوابير الانتظار: بعد انتهاء الـ TTL تعود الرسالة تلقائياً إلى الـ queue الأساسية
    for (const delay of this.retryDelays) {
      await ch.assertQueue(retryQueueName(delay), {
        durable: true,
        arguments: { 'x-message-ttl': delay, 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': QUEUES.EMAIL },
      });
    }
  }

  private async startConsumer(def: ConsumerDef) {
    const ch = await this.conn!.createChannel();
    ch.on('error', (e) => this.logger.error(`Consumer channel error (${def.queue}): ${e.message}`));
    await ch.prefetch(def.prefetch);
    this.consumerChannels.push(ch);
    await ch.consume(def.queue, (msg) => {
      if (!msg) return;
      const delivery: Delivery = {
        msg,
        ack: () => ch.ack(msg),
        nack: (requeue) => ch.nack(msg, false, requeue),
      };
      def.handler(delivery).catch((e) => {
        this.logger.error(`Handler failed for ${def.queue}, requeueing: ${(e as Error).message}`);
        setTimeout(() => { try { delivery.nack(true); } catch { /* القناة أُغلقت */ } }, 5000);
      });
    }, { noAck: false });
    this.logger.log(`Consuming ${def.queue}`);
  }
}