//---------------------------------------------
// Electron Setup Code
//---------------------------------------------
// Module Requirements
const { app, BrowserWindow } = require('electron');
const path = require('path');

//---------------------------------------------
// Node Server Setup Code
//---------------------------------------------
// Module Requirements
const express = require("express");
const generate = require('self-signed');
const portfinder = require('portfinder');
const dns = require('dns')
const os = require('os');
const expressApp = express();
const QRCode = require('qrcode');
const SerialPort =require('serialport');
require('electron-reload')(__dirname);

// Status variables
let dmxConnected = false;
let dashboards,phones;
    
// Bootstrap server
(async() => {
  console.log("===================================");

  let port = await findPort(); // Find open port
  console.log(`🔌  Found Open Port: ${port}`); // Log port

  let addr = await getAddr(); // Get desktop IP Address
  console.log(`🌐  IP Address: ${addr}`); // Log IP address

  // Try catch loop to stop random SSL Errors
  let io;
  while(true){
    try{
      let certs = await generateCerts(addr, port); // Generate self-signed ssl
      console.log(`🔐  Certificate:' ${certs}`); // Log cert info
  
      io = await startServer(port, certs); // Start express server
      console.log(`🖥  Server Open At: ${addr}:${port}`); // Log server start

      // If server started correctly break loop
      if(io) break;
    } catch{
      console.log("SSL Error");
    }
  }

  let qr = await generateQR(addr, port); // Generate QR code for mobile
  console.log(`📷  Generated QR Code`); // Log QR code

  let dmx = await scanSerialPorts(); // Scan for DMX devices
  try{ console.log(`💡 DMX Serial Port at ${dmx[0].path}`) }
  catch{  console.log(`💡  No DMX Device Found`); dmx = false}

  let socketFunc = initSockets(io, qr, dmx); // Initialize socket communication
  console.log(`📮  Socket Communication Open`); // Log socket confirmation

  let window = await createWindow(port); // Open Electron window
  console.log(`🌟  Window Created`);  // Log Electron confirmation

})().catch(err => console.error(err)); // General error catch-all

//---------------------------------------------
// Find open port using Node Portfinder
function findPort(){
  let findPort = new Promise((resolve, reject) => {
    portfinder.getPortPromise()
    .then(port => {resolve(port)})
    .catch(err => reject(err));
  });
  return findPort;
}

//---------------------------------------------
// Get desktop IP Address using a dns/os lookup
function getAddr(){
  let IPAddr = new Promise((resolve, reject) => {
    // Lookup ip address
    resolve(os.networkInterfaces()['en0'].find(x => x.family == 'IPv4').address);
    // dns.lookup(os.hostname(), (err, addr, fam) => resolve(addr));
  });
  return IPAddr;
}

//---------------------------------------------
// Generate self-signed security certificates for https
function generateCerts(addr, port){
  let pemCerts = new Promise((resolve, reject) => {
    //  Generate self-signed certificate
    const pems = generate({
      name: `${addr}:${port}`,
      city: 'New York City',
      state: 'New York',
      organization: 'NYU',
      unit: 'Ethan Printz'
    }, {
      keySize: 1024, // Default
      expire: 2 * 365 * 24 * 60 * 60 * 1000 // 1 year
    });
    resolve(pems);
  });
  return pemCerts;
}

//---------------------------------------------
// Start local express server
function startServer(port, certs){
  // Try catch to stop SSL Errors
  let socketIO = new Promise((resolve, reject) => {
    // Require http server
    let server = require("https")
      .createServer({
        key: certs['private'],
        cert: certs['cert']
      },expressApp)
      .listen(port, function() {
        // Open public folder to client
        expressApp.use(express.static('public'));
        // Routing - Phone client at /
        expressApp.get('/mobile', (req, res) => {
          res.sendFile(path.join(__dirname + '/views/phone.html'));
        });
        // Initialize Socket.IO
        let io = require("socket.io").listen(server);
        // Resolve Promise
        resolve(io);
      });
  });
  return socketIO;
}

//---------------------------------------------
// Generate QR code image for mobile scanning
function generateQR(addr, port){
  let qr = new Promise((resolve, reject) => {
    // Convert to image data URL
    QRCode.toDataURL(`https://${addr}:${port}/mobile`)
    .then(url => resolve(url))
    .catch(err => reject(err));
  });
  return qr;
}

//---------------------------------------------
// Initialize Socket.IO Communication
function initSockets(io, phoneQRCode, dmx){
  // Setup phone sockets
  phones = io.of('/phone');
  let phoneCounter = 0;
  // Listen for dashboard clients to connect
  phones.on('connection', socket => {
    // Log connection to console
    console.log('📱 A phone connected: ' + socket.id);
    phoneCounter++;
    if(phoneCounter == 1) dashboards.emit('phoneConnected');

    // Upon receiving motion data
    socket.on('motionData', data => {
      dashboards.emit('motionData', data)
    });

    socket.on('addLight', data => {
      dashboards.emit('addLight', data)
    });

    socket.on('saveScene', () => {
      console.log("SAVE SCENE")
      dashboards.emit('saveScene');
    });

    // Listen for this dashboard client to disconnect
    socket.on('disconnect', () => {
      phoneCounter--;
      if(phoneCounter < 1) dashboards.emit('phoneDisconnected')
      console.log('➡️ 📱  A phone has disconnected '+ socket.id);
    });
  });

  // Setup dashboard sockets
  dashboards = io.of('/dashboard');
  // Listen for dashboard clients to connect
  dashboards.on('connection', socket => {
    // Log connection to console
    console.log('💻  A dashboard connected: ' + socket.id);

    // Emit QR Code img data directly after connecction
    socket.emit('qrCode', phoneQRCode);
    if(dmx) dashboards.emit('dmxConnected', dmx);

    // Listen for this dashboard client to disconnect
    socket.on('disconnect', () => {
      console.log('➡️ 💻  A dashboard has disconnected '+ socket.id);
    });
  });
}

//---------------------------------------------
// Detect and return serial port list
function scanSerialPorts(){
  let dmxPorts = new Promise((resolve, reject) => {
    // Get ports list
    SerialPort.list().then(ports => {
      // Define array to hold registered ports
      let dmxPorts = [];
      let dmxType;
      //  Iterate through open serial ports
      ports.forEach(port => {
        // If a connected USB Device is detected
        if(port.productId){
          // Enttec DMX USB Pro
          if(port.vendorId == 403 && port.productId == 6001){
            dmxType = 'enttec-open-usb-dmx'
          }
          // Attatch to DMX Ports obj
          dmxPorts.push({
            'name': 'Enttec DMX USB Pro',
            'type': dmxType,
            'path': port.path,
            'serial': port.serialNumber
          });
          dmxConnected = true;
          resolve(dmxPorts);
        }
      });
      resolve(false);
    });
  });
  return dmxPorts;
}

//---------------------------------------------
// Create the desktop Electron windpw
function createWindow(port){
  // Define reusable function
  function createDesktopWindow () {
    // Create the window
    const mainWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      titleBarStyle: 'hidden',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        additionalArguments: [`${port}`],
        nodeIntegration: true
      }
    });
    // Load the index.html of the app
    mainWindow.loadFile(path.join(__dirname, `index.html`))
    // Mazimize size
    mainWindow.maximize();
  }

  let promise = new Promise((resolve, reject) => {
    // Call function to create window
    createDesktopWindow();
    // Quit when all windows are closed.
    app.on('window-all-closed', () => app.quit());
    // Resolve promise
    resolve(true);
  });
  return true;
}
