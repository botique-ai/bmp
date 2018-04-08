import {Button} from "./BotMessage";

export type BMPMenu = Array<Button | {
  title: string;
  subMenu: BMPMenu
}>;

export interface BotBMPSettings {
  logoURL?: string;
  backgroundColor?: string;
  color?: string;
  menu?: BMPMenu;
}
