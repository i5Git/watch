export default {
  VITE_SERVER_HOST: import.meta.env.VITE_SERVER_HOST,
  VITE_OAUTH_REDIRECT_HOSTNAME:
    import.meta.env.VITE_OAUTH_REDIRECT_HOSTNAME ?? window.location.origin,
  VITE_TURN_SERVERS: import.meta.env.VITE_TURN_SERVERS ?? "",
  VITE_TURN_USERNAME: import.meta.env.VITE_TURN_USERNAME ?? "",
  VITE_TURN_CREDENTIAL: import.meta.env.VITE_TURN_CREDENTIAL ?? "",
  NODE_ENV: import.meta.env.DEV ? "development" : "production",
};
