import { Gender } from "./Gender";

export interface ChatUserProfile {
  _id?: string;
  firstName?: string;
  lastName?: string;
  profilePic?: string;
  gender?: Gender;
  locale: string;
  timezone: number;
}
