export interface VisitorRegion {
  country: string;
  region?: string;
}

export declare const readRegionCookie: (cookie: string) => VisitorRegion | null;

export declare const regionFromTimeZone: (timeZone: string) => VisitorRegion | null;

export declare const resolveVisitorRegion: (input: {
  cookie: string;
  timeZone: string | null;
}) => VisitorRegion | null;
