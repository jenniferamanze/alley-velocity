const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const lanes =; 
let currentLane = 1; 

let score = 0;
let gameActive = true;

let playerStyle = {
    name: "Guest Runner",
    primaryColor: "#d8fd71",   
    secondaryColor: "#2b2f4a", 
    hat: "none"
};

let player = { y: 440, width: 40, height: 50 };
let obstacles = [];
let obstacleSpeed = 5;
let spawnTimer = 0;

const START_NG = 'https://start.ng';
let frame;

function connectFrame() {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.onload = () => resolve(el);
    el.onerror = reject;
    document.body.append(el);
  });
  return frame;
}

async function askStartNg(message, replyType, timeoutMs = 5000) {
  const el = await connectFrame();
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply) => { clearTimeout(timer); removeEventListener('message', onMessage); resolve(reply); };
    const timer = setTimeout(() => done(null), timeoutMs);
    function onMessage(e) {
      if (e.origin !== START_NG || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    el.contentWindow.postMessage({ ...message, requestId }, START_NG);
  });
}

async function fetchUser() {
    const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
    const userData = reply?.user ?? reply?.guest;
    if (userData) {
        playerStyle.name = userData.name;
        if (userData.style) {
            playerStyle.primaryColor = userData.style.primaryColor || playerStyle.primaryColor;
            playerStyle.secondaryColor = userData.style.secondaryColor || playerStyle.secondaryColor;
            playerStyle.hat = userData.style.hat || "none";
        }
    }
}
fetchUser();

window.addEventListener("keydown", (e) => {
    if (!gameActive) return;
    if (e.key === "ArrowLeft" && currentLane > 0) currentLane--;
    if (e.key === "ArrowRight" && currentLane < 2) currentLane++;
});

function spawnObstacle() {
    let randomLane = Math.floor(Math.random() * 3);
    obstacles.push({
        x: lanes[randomLane] - 20,
        y: -40,
        width: 40,
        height: 40
    });
}

async function gameOver() {
    gameActive = false;
    await askStartNg({ type: 'startng:score', score: score }, 'startng:scoreSaved');
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#444";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(120, 0); ctx.lineTo(120, canvas.height);
    ctx.moveTo(240, 0); ctx.lineTo(240, canvas.height);
    ctx.stroke();

    if (gameActive) {
        score++;
        
        spawnTimer++;
        if (spawnTimer > 40) {
            spawnObstacle();
            spawnTimer = 0;
            if (score % 500 === 0) obstacleSpeed += 0.5; 
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
            obstacles[i].y += obstacleSpeed;

            let pX = lanes[currentLane] - (player.width / 2);
            if (obstacles[i].y + obstacles[i].height >= player.y &&
                obstacles[i].y <= player.y + player.height &&
                obstacles[i].x < pX + player.width &&
                obstacles[i].x + obstacles[i].width > pX) {
                gameOver();
            }

            ctx.fillStyle = "#ff4757";
            ctx.fillRect(obstacles[i].x, obstacles[i].y, obstacles[i].width, obstacles[i].height);

            if (obstacles[i].y > canvas.height) obstacles.splice(i, 1);
        }
    }

    let targetX = lanes[currentLane] - (player.width / 2);
    
    ctx.fillStyle = playerStyle.secondaryColor;
    ctx.fillRect(targetX, player.y + 25, player.width, 25);

    ctx.fillStyle = playerStyle.primaryColor;
    ctx.fillRect(targetX, player.y, player.width, 25);

    if (playerStyle.hat !== "none") {
        ctx.fillStyle = "#ffa502"; 
        ctx.fillRect(targetX + 5, player.y - 12, player.width - 10, 12);
    }

    ctx.fillStyle = "#fff";
    ctx.font = "16px Arial";
    ctx.fillText("Runner: " + playerStyle.name, 15, 30);
    ctx.fillText("Score: " + score, 15, 55);

    if (!gameActive) {
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ff4757";
        ctx.font = "30px Arial";
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2);
        ctx.fillStyle = "#fff";
        ctx.font = "16px Arial";
        ctx.fillText("Score Saved to Leaderboard!", canvas.width / 2, (canvas.height / 2) + 40);
    }

    requestAnimationFrame(gameLoop);
}

gameLoop();
