const { app, BrowserWindow, net, protocol, shell, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "vainglory-three",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function appRoot() {
  return app.getAppPath();
}

function viewerHtmlPath() {
  return path.join(appRoot(), "extracted", "viewer", "index.html");
}

function localThreePath(url) {
  const parsed = new URL(url);
  const prefix = "/npm/three@0.160.0/";
  if (parsed.hostname !== "cdn.jsdelivr.net" || !parsed.pathname.startsWith(prefix)) return "";
  return path.join(appRoot(), "node_modules", "three", parsed.pathname.slice(prefix.length));
}

function localThreeRedirectUrl(url) {
  const localPath = localThreePath(url);
  return localPath ? url.replace(/^https:/, "vainglory-three:") : "";
}

function registerLocalThreeRedirects() {
  protocol.handle("vainglory-three", (request) => {
    const httpsUrl = request.url.replace(/^vainglory-three:/, "https:");
    const localPath = localThreePath(httpsUrl);
    if (!localPath) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(localPath).toString());
  });

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["https://cdn.jsdelivr.net/npm/three@0.160.0/*"] },
    (details, callback) => {
      const redirectUrl = localThreeRedirectUrl(details.url);
      callback(redirectUrl ? { redirectURL: localThreeRedirectUrl(details.url) } : {});
    },
  );
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    title: "虚荣英雄模型查看器",
    backgroundColor: "#0b0c0a",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  window.loadFile(viewerHtmlPath());
  return window;
}

app.whenReady().then(() => {
  registerLocalThreeRedirects();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

module.exports = {
  createWindow,
  localThreePath,
  localThreeRedirectUrl,
  registerLocalThreeRedirects,
  viewerHtmlPath,
};
