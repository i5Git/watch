import React from "react";

export interface ClientUser {
  username: string;
  uid: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
  disabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
}

export interface MetadataState {
  user: ClientUser | undefined;
  ready: boolean;
  streamPath: string | undefined;
  beta: boolean;
  siteSettings: {
    brandName: string;
    defaultRoomName: string;
    landingEnabled: boolean;
  };
  refreshSiteSettings: () => Promise<void>;
}

export const DEFAULT_STATE: MetadataState = {
  user: undefined,
  ready: false,
  streamPath: undefined,
  beta: false,
  siteSettings: {
    brandName: "Watch",
    defaultRoomName: "اتاق تماشا",
    landingEnabled: true,
  },
  refreshSiteSettings: async () => {},
};

export const MetadataContext = React.createContext<MetadataState>(DEFAULT_STATE);
