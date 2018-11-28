import { app, BrowserWindow } from "electron"

let mainWindow = null
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    resizable: false,
    useContentSize: true,
    webPreferences: {
      backgroundThrottling: false
    }
  })

  mainWindow.loadURL(`file://${__dirname}/index.html`)
}

app.on('ready', createWindow)
app.on('window-all-closed', () => app.exit())
