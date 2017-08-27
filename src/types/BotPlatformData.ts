export interface BotPlatformData {
  _id: string | any;
  name?: string;
  platformData: { [key: number]: any }; // the key is a platform type
}
