import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * MAIL_DRIVER=smtp  => إرسال حقيقي (Gmail عبر App Password)
 * MAIL_DRIVER=log   => لا يُرسل شيئاً، يطبع فقط (للاختبارات)
 * MAIL_FORCE_FAIL=true => يفشل دائماً (لإظهار Retry وDLQ في العرض)
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly driver: string;
  private readonly from: string;
  private readonly transporter: Transporter;

  constructor(private readonly config: ConfigService) {
    this.driver = config.get<string>('MAIL_DRIVER', 'log');
    this.from = config.get<string>('MAIL_FROM', 'Souq Store <no-reply@localhost>');
    if (this.driver === 'smtp') {
      const user = config.get<string>('SMTP_USER');
      const pass = config.get<string>('SMTP_PASS');
      if (!user || !pass) throw new Error('SMTP_USER and SMTP_PASS are required when MAIL_DRIVER=smtp');
      this.transporter = nodemailer.createTransport({
        host: config.get<string>('SMTP_HOST', 'smtp.gmail.com'),
        port: Number(config.get('SMTP_PORT', 465)),
        secure: String(config.get('SMTP_SECURE', 'true')) === 'true',
        auth: { user, pass: pass.replace(/\s+/g, '') },
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
      });
    } else {
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
    }
  }

  async send(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
    if (String(this.config.get('MAIL_FORCE_FAIL', 'false')) === 'true') {
      throw new Error('Simulated mail failure (MAIL_FORCE_FAIL=true)');
    }
    const info = await this.transporter.sendMail({ from: this.from, ...message });
    if (this.driver !== 'smtp') this.logger.log(`[mail:log] to=${message.to} subject="${message.subject}"`);
    else this.logger.log(`Email sent to ${message.to} (${info.messageId})`);
  }
}