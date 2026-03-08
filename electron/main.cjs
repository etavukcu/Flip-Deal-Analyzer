const { app, BrowserWindow } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1200,
    minHeight: 800,
    title: 'Flip Deal Analyzer',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;

  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    win.loadURL(pathToFileURL(indexPath).toString());
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
