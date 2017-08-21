import { CollectedParams } from "./CollectedParams";

export interface TargetIntent {
  intent?: string; // _id
  intentName?: string;
  parameters?: CollectedParams;
  entities?: Array<{
    _id: string | any;
    value: any;
  }>;
}
