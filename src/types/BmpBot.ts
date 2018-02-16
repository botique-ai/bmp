import {BotBMPSettings} from "./BotBMPSettings";

export interface BMPBot {
  _id: string;
  name: string;
  description?: string;
  settings: BotBMPSettings;
}
