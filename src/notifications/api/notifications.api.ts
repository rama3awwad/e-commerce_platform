export abstract class NotificationsApi {
  abstract notify(input: { userId: string; type: string; title: string; message: string }): Promise<void>;
  abstract deleteAllForUser(userId: string): Promise<void>;
}
