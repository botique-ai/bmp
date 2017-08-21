export enum BotPlatformType {
  Facebook,
  DirectLine,
  Custom
}

export namespace BotPlatformType {
  export function label(e: BotPlatformType): string {
    switch (e) {
      case BotPlatformType.Facebook:
        return "Facebook";
      case BotPlatformType.DirectLine:
        return "DirectLine";
      case BotPlatformType.Custom:
        return "Custom";
    }
  }
}
