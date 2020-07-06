// Import modules
const io = require('socket.io-client');
const $ = require("jquery");
const convert = require('color-convert');

// Global variables
global.rotationAngles = {
    sideAxis:0,
    topAxis: 0,
    displayAxis: 0
}

global.lightPlot = [
    
]

global.cues = [

]

//-------------------------------------
// Intro sequence
//-------------------------------------
// Get port from window arguments
let port = window.process.argv.slice(-1);
let firstTimeConnected = true;

// Connect to socket port for dashboard
let socket = io.connect(`https://localhost:${port}/dashboard`, { secure: true, reconnect: true, rejectUnauthorized : false } );

//---------------------------------
// Status Bar
//---------------------------------
// Get QR Code
socket.on('qrCode', data => {
    $('#qrCode').html(`<img src=${data} id="qrCode" draggable="false">`);
});

$(".statusIcon").hover(function() {
    let hoverID = $(this).attr("id")
    if(hoverID == "phoneIcon") $("#qrPopup").css("display","block");
    else if(hoverID == "dmxIcon")$("#dmxPopup").css("display","block");
    else if(hoverID == "settingsIcon") $("#settingsPopup").css("display","block");
}, function() {
    $(".statusPopup").css("display","none");
});

$(".statusPopup").hover(function(){
    $(this).css("display","block");
}, function(){
    $(this).css("display","none");
});

// Detect phone connection or skip
socket.on('phoneConnected', () => {
    $("#phoneIcon").removeClass("goodIcon");
    $("#phoneIcon").removeClass("badIcon");
    $("#phoneIcon").addClass("warningIcon");
    $("#qrCode").css("display","none");
    $("#qrPopup .statusTitle").html("Enable Motion Permissions");
});
socket.on('phoneDisconnected', () => {
    $("#phoneIcon").removeClass("warningIcon");
    $("#phoneIcon").removeClass("goodIcon");
    $("#phoneIcon").addClass("badIcon");
    $("#userDirection").css("display","none");
    $("#qrCode").css("display","block");
    $("#qrPopup .statusTitle").html("Connect Phone to Dashboard");
    $("#deviceOrientation").css("display","none");
    firstTimeConnected = true;
});

// Detect DMX Connection
socket.on('dmxConnected', dmxPorts => {
    // Modify Icon CSS
    $("#dmxIcon").removeClass("warningIcon");
    $("#dmxIcon").removeClass("badIcon");
    $("#dmxIcon").addClass("goodIcon");
    // Modify Popup HTML
    $("#dmxPopup .statusTitle").html("Interface Connected")
    dmxPorts.forEach(port => {
        $("#dmxMenu").append(`
        <div class="dmxItem">
            <div class="dmxItemIcon"></div>
            <div class="dmxItemName">${port.name}</div>
            <div class="dmxItemPath">${port.path}</div>
        </div>
        `);
    });
})

//---------------------------------
// On Motion Data
//---------------------------------
socket.on('motionData', angles => {
    // Save data to global state
    global.rotationAngles = angles;
    // If phone is connecting for the first time
    if(firstTimeConnected){
        // CSS Changes
        $("#phoneIcon").removeClass("warningIcon");
        $("#phoneIcon").removeClass("badIcon");
        $("#phoneIcon").addClass("goodIcon");
        $("#userDirection").css("display","block");
        $("#qrCode").css("display","none");
        $("#qrPopup .statusTitle").html("Phone Connected");
        $("#deviceOrientation").css("display","block");
        firstTimeConnected = false;
    }
    // Rotate phone in popup
    $("#deviceOrientation").css("transform",`
        rotateX(${90 - angles['sideAxis']}deg) 
        rotateY(${angles['topAxis']}deg) 
        rotateZ(-${angles['displayAxis']}deg)
    `);
    // Rotate center circle
    $("#userDirection").css("transform",`rotate(${180 - angles['displayAxis']}deg)`);
    // Check if highlighting light
    for(l in lightPlot){
        // If phone is pointing at this light
        if(Math.abs(angles['displayAxis'] - lightPlot[l]['angle']) < 10 ){
            // If this is the first 'draw' of it pointing at light
            if(!$(`[data-light-key=${lightPlot[l]['key']}]`).hasClass("selectedLight")){
                $(`[data-light-key=${lightPlot[l]['key']}]`).addClass("selectedLight");
            }
            // Determine color
            let hue = angles['topAxis']*1.5;
            // Determine intensity
            let lit = ((angles['sideAxis'] > 0 ? angles['sideAxis'] : 0) + 0.15);
            // Get RGB values from HSL
            let color = convert.hsl.rgb(hue, 1, lit);
            $(`[data-light-key=${lightPlot[l]['key']}]`).find('.lightIcon').css("fill",`rgb(${color[0]},${color[1]},${color[2]})`)
            
        } else{
            if($(`[data-light-key=${lightPlot[l]['key']}]`).hasClass("selectedLight")){
                lightPlot[l]['color'] = $(`[data-light-key=${lightPlot[l]['key']}]`).find('.lightIcon').css("fill");
                $(`[data-light-key=${lightPlot[l]['key']}]`).removeClass("selectedLight");
            }
        }
    }
});

//---------------------------------
// On Add Light
//---------------------------------
socket.on('addLight', data => {
    $("#lights").append(`
        <div 
            class="light" 
            data-light-type="par" 
            data-light-key="${lightPlot.length}"
            style="transform:rotate(${180 - global.rotationAngles['displayAxis']}deg)">
            <svg class="lightIcon">
                <use xlink:href="./public/img/par-light.svg#par"></use>
            </svg>
        </div>
    `);
    lightPlot.push({
        key: lightPlot.length,
        type: 'par',
        address: lightPlot.length,
        angle: global.rotationAngles['displayAxis'],
        color: ''
    });
    console.log(lightPlot);
});

//---------------------------------
// On Save Scene
//---------------------------------
socket.on('saveScene', () => {
    let lightDOM = '';
    for(l in global.lightPlot){
        lightDOM += `<div class="cueLight" style="color:${ lightPlot[l]['color'] }">Light ${ lightPlot[l]['key'] }</div>`;
    }
    cues.push(lightPlot);

    $("#cueBar").append(`
    <div class="cue" >
        <div class="cueLeftBar">${global.cues.length}</div>
        <div class="cueRightBar">
        ${ lightDOM }
        </div>
    </div>
    `);
});

//---------------------------------
// On Go Press
//---------------------------------
$("#cueGo").on("click", e => {
    let repetitions = 0;
    setInterval(() => {
        // $(`.cue:nth-child${3 + (repetitions % global.cues.length)}`)
        // Iterate through lights
        for(l in global.cues[repetitions]){
            let lightKey = global.cues[repetitions][l]['key'];
            let lightColor = global.cues[repetitions][l]['color'];
            console.log(`rgb(${lightColor[0]},${lightColor[1]},${lightColor[2]})`);
            $(`[data-light-key=${lightKey}]`).css("fill",`rgb(${lightColor[0]},${lightColor[1]},${lightColor[2]})`)
        }
        repetitions++;
    }, 500)
})