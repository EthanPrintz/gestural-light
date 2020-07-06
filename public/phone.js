// Init websockets
let socket = io('/phone');

let permissionGranted = false;

if (typeof DeviceOrientationEvent.requestPermission === 'function') {
  $(".enableMotion").click(() => {
    DeviceOrientationEvent.requestPermission()
      .then(permissionState => {
        if (permissionState === 'granted') {
          $(".bottomButton").removeClass("enableMotion");
          $(".bottomButton").addClass("addLight");
          $("#onboardingText").css("display","none");
          $("#saveScene").css("display","block");
          permissionGranted = true;
          window.addEventListener('deviceorientation', deviceMotion);
        } else{
          $("#onboardingText").html("Motion access is necessary for functionality. Refresh page and try again.")
        }
      })
      .catch(console.error);
  });
} else {
    // handle regular non iOS 13+ devices
}

function deviceMotion(e){
  let angles = {
    'displayAxis': e.alpha,
    'sideAxis': e.beta,
    'topAxis': e.gamma
  }
  socket.emit('motionData', angles);
}

$(".bottomButton").on('click', e => {
  if(permissionGranted){
    socket.emit('addLight', {
      key: 0
    });
  }
});

$("#saveScene").on('click', e => {
  socket.emit('saveScene');
});