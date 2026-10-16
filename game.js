// Alley Velocity: dodge the barriers as your start.ng character.

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const signInBtn = document.getElementById("signin");
const W = canvas.width;
const H = canvas.height;

// ---------------------------------------------------------------------------
// start.ng connection (the helper from start.ng/docs.md, "Talk to start.ng")
// ---------------------------------------------------------------------------
const START_NG = "https://start.ng";
// The connect page only answers games served from *.start.ng. Anywhere else
// (GitHub Pages, a local file) the game still plays, as a guest.
const ON_START_NG = location.hostname.endsWith(".start.ng");
let frame;

function connectFrame() {
    frame ??= new Promise((resolve, reject) => {
        const el = document.createElement("iframe");
        el.src = `${START_NG}/connect`;
        el.hidden = true;
        el.title = "start.ng connection";
        el.onload = () => resolve(el);
        el.onerror = reject;
        document.body.append(el);
    });
    return frame;
}

// Sends a message and resolves to start.ng's reply, or null if it didn't answer.
async function askStartNg(message, replyType, timeoutMs = 5000) {
    if (!ON_START_NG) return null;
    let el;
    try {
        el = await connectFrame();
    } catch {
        return null;
    }
    return new Promise((resolve) => {
        const requestId = Math.random().toString(36).slice(2);
        const done = (reply) => { clearTimeout(timer); removeEventListener("message", onMessage); resolve(reply); };
        const timer = setTimeout(() => done(null), timeoutMs);
        function onMessage(e) {
            if (e.origin !== START_NG || e.source !== el.contentWindow) return;
            if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
        }
        addEventListener("message", onMessage);
        el.contentWindow.postMessage({ ...message, requestId }, START_NG);
    });
}

// ---------------------------------------------------------------------------
// The player and their character
// ---------------------------------------------------------------------------
const DEFAULT_STYLE = {
    body: "male",
    primaryColor: "#9aa3b5",
    secondaryColor: "#4a4f60",
    skinColor: "#d9a066",
    hairColor: "#2b1d14",
    hair: "short",
    hat: "none",
    accessory: "none",
};
const STYLE_OPTIONS = {
    body: ["female", "male"],
    hair: ["short", "afro", "braids", "bun", "ponytail", "dreads", "bald"],
    hat: ["none", "cap", "beanie", "tophat", "crown"],
    accessory: ["none", "glasses", "earrings", "beard", "scarf", "backpack"],
};
const STYLE_COLORS = ["primaryColor", "secondaryColor", "skinColor", "hairColor"];
const HEX = /^#[0-9a-f]{6}$/i;

// Keeps every known value from start.ng and falls back for anything missing or new.
function cleanStyle(style) {
    const s = { ...DEFAULT_STYLE };
    if (style && typeof style === "object") {
        for (const key of STYLE_COLORS) if (HEX.test(style[key] ?? "")) s[key] = style[key];
        for (const key of Object.keys(STYLE_OPTIONS)) if (STYLE_OPTIONS[key].includes(style[key])) s[key] = style[key];
    }
    return s;
}

let player = { signedIn: false, name: "Guest", account: "", style: cleanStyle(null) };

function applyPlayer(reply) {
    const user = reply?.user ?? null;
    const who = user ?? reply?.guest ?? null;
    player = {
        signedIn: !!user,
        name: who?.name || "Guest",
        account: user?.account || "",
        style: cleanStyle(who?.style),
    };
    if (signInBtn) signInBtn.hidden = !ON_START_NG || player.signedIn;
}

async function refreshPlayer() {
    const reply = await askStartNg({ type: "startng:whoami" }, "startng:user");
    if (reply) applyPlayer(reply); // if start.ng didn't answer, keep the current player
}

// After sign-in start.ng adds a session to the address. This game uses the
// connect page instead, so just tidy the address bar.
if (location.hash.includes("startng_session=")) {
    history.replaceState(null, "", location.pathname + location.search);
}

signInBtn?.addEventListener("click", () => {
    location.href = `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
});

// The player may have signed in or out on start.ng while away from this tab.
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshPlayer();
});
addEventListener("focus", refreshPlayer);
refreshPlayer();

// ---------------------------------------------------------------------------
// Drawing the character (front-facing, feet at footY)
// ---------------------------------------------------------------------------
const INK = "#1b1b22";
const GOLD = "#ffcf4d";

function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
}

function roundRect(x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
}

function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

function poly(points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
}

// Darkens (amount < 0) or lightens (amount > 0) a #rrggbb colour.
function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const channel = (c) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
    const r = channel((n >> 16) & 255), g = channel((n >> 8) & 255), b = channel(n & 255);
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function drawCharacter(cx, footY, style, t, running, scale = 1) {
    const s = cleanStyle(style);
    const female = s.body === "female";
    const swing = running ? Math.sin(t * 0.35) : 0;
    const bob = running ? -Math.abs(Math.cos(t * 0.35)) * 2 : 0;

    ctx.save();
    ctx.translate(cx, footY);
    ctx.scale(scale, scale);

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 1, 16, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs and shoes (the leg in the air is shorter)
    const liftL = Math.max(0, swing) * 4;
    const liftR = Math.max(0, -swing) * 4;
    rect(-10, -20, 8, 20 - liftL, s.secondaryColor);
    rect(2, -20, 8, 20 - liftR, s.secondaryColor);
    rect(-11, -3 - liftL, 10, 3, INK);
    rect(1, -3 - liftR, 10, 3, INK);

    ctx.translate(0, bob);

    // Backpack sits behind the body, showing above the shoulders
    if (s.accessory === "backpack") roundRect(-15, -48, 30, 24, 4, shade(s.secondaryColor, -0.08));

    // Hair that hangs behind the head
    drawHairBack(s);

    // Skirt for the female body
    if (female) poly([[-12, -24], [12, -24], [16, -12], [-16, -12]], s.secondaryColor);

    // Torso and arms
    const torsoW = female ? 22 : 26;
    roundRect(-torsoW / 2, -44, torsoW, 22, 3, s.primaryColor);
    const armX = torsoW / 2;
    rect(-armX - 6, -43 + swing * 2, 6, 17, s.primaryColor);
    rect(armX, -43 - swing * 2, 6, 17, s.primaryColor);
    rect(-armX - 6, -26 + swing * 2, 6, 5, s.skinColor);
    rect(armX, -26 - swing * 2, 6, 5, s.skinColor);

    if (s.accessory === "backpack") {
        rect(-9, -44, 3, 16, shade(s.secondaryColor, -0.08));
        rect(6, -44, 3, 16, shade(s.secondaryColor, -0.08));
    }

    // Neck and head
    rect(-4, -47, 8, 4, s.skinColor);
    roundRect(-12, -70, 24, 24, 5, s.skinColor);
    rect(-7, -61, 3, 4, INK);
    rect(4, -61, 3, 4, INK);

    // Accessories on the face and neck
    if (s.accessory === "beard") {
        poly([[-12, -55], [12, -55], [10, -46], [4, -42], [-4, -42], [-10, -46]], s.hairColor);
        rect(-4, -52, 8, 2, s.skinColor);
    } else {
        rect(-3, -52, 6, 1.5, shade(s.skinColor, -0.25));
    }
    if (s.accessory === "glasses") {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-9.5, -63, 7, 7);
        ctx.strokeRect(2.5, -63, 7, 7);
        rect(-2.5, -60.5, 5, 1.5, INK);
    }
    if (s.accessory === "earrings") {
        circle(-13, -53, 2.2, GOLD);
        circle(13, -53, 2.2, GOLD);
    }
    if (s.accessory === "scarf") {
        roundRect(-13, -48, 26, 6, 2, s.secondaryColor);
        rect(5, -43, 6, 13, s.secondaryColor);
    }

    // Hair on top of the head, then the hat
    drawHairFront(s);
    drawHat(s, -70 - (s.hair === "afro" ? 8 : 0));

    ctx.restore();
}

function drawHairBack(s) {
    const c = s.hairColor;
    switch (s.hair) {
        case "afro":
            circle(0, -63, 19, c);
            break;
        case "braids":
            for (const x of [-17, -12, 8, 13]) {
                rect(x, -64, 4, 30, c);
                circle(x + 2, -33, 2.5, shade(c, 0.15));
            }
            break;
        case "dreads":
            [[-18, 26], [-14, 30], [-10, 24], [6, 24], [10, 30], [14, 26]].forEach(([x, len]) =>
                roundRect(x, -64, 4, len, 2, c));
            break;
        case "ponytail":
            poly([[8, -68], [14, -68], [22, -40], [16, -38]], c);
            break;
        case "bun":
            circle(0, -73, 7, c);
            break;
    }
}

function drawHairFront(s) {
    const c = s.hairColor;
    switch (s.hair) {
        case "bald":
            return;
        case "afro":
            roundRect(-14, -74, 28, 10, 5, c);
            return;
        case "short":
            roundRect(-13, -73, 26, 9, 4, c);
            rect(-13, -66, 3, 7, c);
            rect(10, -66, 3, 7, c);
            return;
        default: // braids, dreads, ponytail and bun share a neat top
            roundRect(-13, -73, 26, 8, 4, c);
            rect(-13, -66, 3, 10, c);
            rect(10, -66, 3, 10, c);
            if (s.hair === "ponytail") rect(11, -69, 5, 4, s.primaryColor); // hair tie
    }
}

function drawHat(s, base) {
    switch (s.hat) {
        case "cap":
            roundRect(-13, base - 8, 26, 9, 5, s.secondaryColor);
            rect(-15, base, 30, 3, shade(s.secondaryColor, -0.15));
            break;
        case "beanie":
            roundRect(-14, base - 9, 28, 11, 6, s.secondaryColor);
            rect(-15, base - 1, 30, 4, shade(s.secondaryColor, -0.15));
            circle(0, base - 11, 4, s.primaryColor);
            break;
        case "tophat":
            rect(-17, base - 1, 34, 3, INK);
            rect(-10, base - 20, 20, 19, INK);
            rect(-10, base - 5, 20, 4, s.secondaryColor);
            break;
        case "crown":
            poly([[-13, base + 1], [-13, base - 8], [-7, base - 3], [0, base - 11], [7, base - 3],
                [13, base - 8], [13, base + 1]], GOLD);
            circle(0, base - 2, 2, s.primaryColor);
            break;
    }
}

// ---------------------------------------------------------------------------
// The game
// ---------------------------------------------------------------------------
const lanes = [60, 180, 300];
const FOOT_Y = 515;
const CHARACTER_SCALE = 1.25;
const HITBOX = { w: 36, h: 76 }; // around the character, measured up from the feet
const STEP = 1000 / 60; // the game updates 60 times a second on every screen

let state = "playing"; // "playing" | "over"
let lane = 1;
let playerX = lanes[lane];
let score = 0;
let speed = 5;
let spawnTimer = 0;
let obstacles = [];
let tick = 0;
let roadOffset = 0;
let overAt = 0;
let saveMessage = "";

function resetRun() {
    state = "playing";
    lane = 1;
    playerX = lanes[lane];
    score = 0;
    speed = 5;
    spawnTimer = 0;
    obstacles = [];
    saveMessage = "";
}

function move(dir) {
    if (state !== "playing") return;
    lane = Math.max(0, Math.min(2, lane + dir));
}

function restart() {
    if (state !== "over" || performance.now() - overAt < 600) return; // ignore the tap that crashed
    resetRun();
}

async function endRun() {
    if (state !== "playing") return;
    state = "over";
    overAt = performance.now();
    const runScore = Math.min(score, 1000000000);

    if (!ON_START_NG) {
        saveMessage = "Play on start.ng to save your score";
        return;
    }
    if (!player.signedIn) {
        saveMessage = "Sign in to save your score";
        return;
    }
    saveMessage = "Saving your score…";
    const reply = await askStartNg({ type: "startng:score", score: runScore }, "startng:scoreSaved", 8000);
    if (reply?.ok) {
        const r = reply.result;
        saveMessage = r.improved ? `New best! You're #${r.rank}` : `Your best is ${r.best} (#${r.rank})`;
    } else {
        saveMessage = reply?.error || "Couldn't save your score. Try again later.";
    }
}

function update() {
    tick++;
    // Slide smoothly towards the chosen lane
    playerX += (lanes[lane] - playerX) * 0.35;

    if (state !== "playing") return;

    score++;
    speed = Math.min(14, 5 + Math.floor(score / 500) * 0.5);
    roadOffset = (roadOffset + speed) % 40;

    spawnTimer++;
    if (spawnTimer > Math.max(22, 40 - (speed - 5) * 2)) {
        spawnTimer = 0;
        const l = Math.floor(Math.random() * 3);
        obstacles.push({ x: lanes[l] - 20, y: -40, w: 40, h: 40 });
    }

    const px = playerX - HITBOX.w / 2;
    const py = FOOT_Y - HITBOX.h;
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.y += speed;
        if (o.y < py + HITBOX.h && o.y + o.h > py && o.x < px + HITBOX.w && o.x + o.w > px) {
            endRun();
            return;
        }
        if (o.y > H) obstacles.splice(i, 1);
    }
}

function drawRoad() {
    rect(0, 0, W, H, "#222");
    ctx.fillStyle = "#444";
    for (const x of [120, 240]) {
        for (let y = -40 + roadOffset; y < H; y += 40) ctx.fillRect(x - 2, y, 4, 24);
    }
}

function drawObstacle(o) {
    roundRect(o.x, o.y, o.w, o.h, 4, "#ff4757");
    ctx.save();
    ctx.beginPath();
    ctx.rect(o.x, o.y + 14, o.w, 12);
    ctx.clip();
    ctx.fillStyle = "#fff";
    for (let x = o.x - 12; x < o.x + o.w; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, o.y + 26);
        ctx.lineTo(x + 6, o.y + 26);
        ctx.lineTo(x + 18, o.y + 14);
        ctx.lineTo(x + 12, o.y + 14);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

function fitText(text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    while (text.length > 1 && ctx.measureText(text + "…").width > maxWidth) text = text.slice(0, -1);
    return text + "…";
}

function drawHud() {
    rect(0, 0, W, 56, "rgba(26, 26, 26, 0.8)");
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.fillText(fitText(player.name, 200), 14, 28);
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "#aaa";
    ctx.fillText(player.account ? fitText(`@${player.account}`, 200) : "Not signed in", 14, 45);

    ctx.textAlign = "right";
    ctx.fillStyle = "#d8fd71";
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.fillText(String(score), W - 14, 30);
}

function drawGameOver() {
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff4757";
    ctx.font = "bold 32px system-ui, sans-serif";
    ctx.fillText("Game over", W / 2, H / 2 - 50);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.fillText(`Score ${score}`, W / 2, H / 2 - 12);
    ctx.fillStyle = "#d8fd71";
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText(fitText(saveMessage, W - 40), W / 2, H / 2 + 20);
    ctx.fillStyle = "#aaa";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("Tap or press Space to run again", W / 2, H / 2 + 60);
}

function draw() {
    drawRoad();
    obstacles.forEach(drawObstacle);
    drawCharacter(playerX, FOOT_Y, player.style, tick, state === "playing", CHARACTER_SCALE);
    drawHud();
    if (state === "over") drawGameOver();
}

let last = performance.now();
let acc = 0;
function frameLoop(now) {
    acc += Math.min(250, now - last);
    last = now;
    while (acc >= STEP) {
        update();
        acc -= STEP;
    }
    draw();
    requestAnimationFrame(frameLoop);
}
requestAnimationFrame(frameLoop);

// ---------------------------------------------------------------------------
// Controls: tap or click a side of the road, or use the keyboard
// ---------------------------------------------------------------------------
canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === "over") return restart();
    const box = canvas.getBoundingClientRect();
    const x = (e.clientX - box.left) * (W / box.width);
    move(x < W / 2 ? -1 : 1);
});

addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", " ", "Enter"].includes(e.key)) e.preventDefault();
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") move(-1);
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") move(1);
    if (e.key === " " || e.key === "Enter") restart();
});
