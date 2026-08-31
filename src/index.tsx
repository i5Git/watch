import "@mantine/core/styles.css";
import "./index.css";

import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Redirect, Route } from "react-router-dom";
import { createTheme, Loader, MantineProvider } from "@mantine/core";
import { App } from "./components/App/App";
import { Home } from "./components/Home/Home";
import { Privacy, Terms, FAQ } from "./components/Pages/Pages";
import { TopBar } from "./components/TopBar/TopBar";
import { Footer } from "./components/Footer/Footer";
import { Create } from "./components/Create/Create";
import { AdminPanel } from "./components/Admin/AdminPanel";
import { AccessGate } from "./components/Auth/AccessGate";
import {
  DEFAULT_STATE,
  MetadataContext,
  type ClientUser,
} from "./MetadataContext";
import { softWhite } from "./utils/utils";
import { applyLocale } from "./i18n";
import styles from "./index.module.css";

applyLocale();

const theme = createTheme({
  white: softWhite,
  primaryColor: "coral",
  fontFamily: '"Vazirmatn", "Segoe UI", Tahoma, sans-serif',
  defaultRadius: "md",
  colors: {
    coral: [
      "#fff1ef",
      "#ffd9d4",
      "#ffb4ab",
      "#ff978a",
      "#ff7a69",
      "#f56555",
      "#e34d3d",
      "#bd382d",
      "#8e2c24",
      "#5e1d19",
    ],
  },
});

const Debug = lazy(() => import("./components/Debug/Debug"));

const toClientUser = (user: any): ClientUser => ({
  ...user,
  uid: user.username,
  email: user.username,
  displayName: user.username,
});

class WatchParty extends React.Component {
  public state = {
    ...DEFAULT_STATE,
    refreshSiteSettings: async () => {
      await this.loadSiteSettings();
    },
  };

  async componentDidMount() {
    try {
      const [response] = await Promise.all([
        fetch("/api/auth/session", { credentials: "include" }),
        this.loadSiteSettings(),
      ]);
      if (response.ok) {
        this.setState({ user: toClientUser(await response.json()) });
      }
    } finally {
      this.setState({ ready: true });
    }
  }

  loadSiteSettings = async () => {
    const response = await fetch("/api/site-settings", {
      credentials: "include",
    });
    if (!response.ok) {
      return;
    }
    const siteSettings = await response.json();
    this.setState({ siteSettings });
    document.title = `${siteSettings.brandName} — با هم تماشا کنید`;
    document
      .querySelector('meta[name="apple-mobile-web-app-title"]')
      ?.setAttribute("content", siteSettings.brandName);
  };

  setAuthenticatedUser = (user: any) => {
    this.setState({ user: toClientUser(user), ready: true });
  };

  renderProtectedRoutes() {
    const { landingEnabled } = this.state.siteSettings;
    return (
      <BrowserRouter>
        <Route
          path="/"
          exact
          render={() => (
            <>
              {landingEnabled && <TopBar hideNewRoom />}
              <Home />
              {landingEnabled && <Footer />}
            </>
          )}
        />
        <Route
          path="/:roomCode"
          exact
          render={(props) =>
            /^[a-z]{4}$/i.test(props.match.params.roomCode) ? (
              <Redirect
                to={`/watch/${props.match.params.roomCode.toUpperCase()}`}
              />
            ) : null
          }
        />
        <Route path="/create" exact render={() => <Create />} />
        <Route
          path="/watch/:roomId"
          exact
          render={(props) => <App urlRoomId={props.match.params.roomId} />}
        />
        <Route
          path="/r/:vanity"
          exact
          render={(props) => <App vanity={props.match.params.vanity} />}
        />
        <Route path="/admin" exact render={() => <AdminPanel />} />
        <Route path="/terms">
          <TopBar />
          <Terms />
          <Footer />
        </Route>
        <Route path="/privacy">
          <TopBar />
          <Privacy />
          <Footer />
        </Route>
        <Route path="/faq">
          <TopBar />
          <FAQ />
          <Footer />
        </Route>
        <Route path="/debug">
          <TopBar />
          <Suspense fallback={null}>
            <Debug />
          </Suspense>
          <Footer />
        </Route>
      </BrowserRouter>
    );
  }

  render() {
    return (
      <MantineProvider theme={theme} forceColorScheme="dark">
        <MetadataContext.Provider value={this.state}>
          {!this.state.ready ? (
            <div className={styles.loading}>
              <Loader color="teal" />
            </div>
          ) : this.state.user ? (
            this.renderProtectedRoutes()
          ) : (
            <AccessGate onAuthenticated={this.setAuthenticatedUser} />
          )}
        </MetadataContext.Provider>
      </MantineProvider>
    );
  }
}

if (window.location.hash && window.location.pathname === "/") {
  const hashRoomId = window.location.hash.substring(1);
  window.location.href = "/watch/" + hashRoomId;
}

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<WatchParty />);
