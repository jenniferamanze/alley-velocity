// Alley Velocity: run the neon alley as your start.ng character, dodge the
// barriers and collect coins.
import * as THREE from "three";

const $ = (id) => document.getElementById(id);
const canvas = $("game");
const ui = {
    face: $("face"), name: $("name"), account: $("account"), signin: $("signin"),
    distance: $("distance-value"), coins: $("coins-value"), coinsPill: $("coins"), hint: $("hint"),
    summary: $("summary"), sDistance: $("s-distance"), sCoins: $("s-coins"), sBest: $("s-best"),
    sMessage: $("s-message"), board: $("board"), boardRows: $("board-rows"), sSignin: $("s-signin"),
    again: $("again"), loading: $("loading"),
};

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

function signIn() {
    location.href = `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

// After sign-in start.ng adds a session to the address. This game uses the
// connect page instead, so just tidy the address bar.
if (location.hash.includes("startng_session=")) {
    history.replaceState(null, "", location.pathname + location.search);
}

// ---------------------------------------------------------------------------
// Character style (see "Character style fields" in the docs)
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

// ---------------------------------------------------------------------------
// Renderer, camera and lights
// ---------------------------------------------------------------------------
let renderer;
try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch {
    ui.loading.textContent = "This game needs WebGL, which this browser has switched off. Try another browser.";
    throw new Error("WebGL unavailable");
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const NIGHT = new THREE.Color("#1a1426");
const scene = new THREE.Scene();
scene.background = NIGHT;
scene.fog = new THREE.Fog(NIGHT, 28, 80);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 220);
let camDist = 6.4;

scene.add(new THREE.HemisphereLight("#d9ccff", "#3b2b45", 2.2));
const sun = new THREE.DirectionalLight("#fff3e6", 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 7, bottom: -7, near: 1, far: 30 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

function layout() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow (portrait) screens need a wider view and a camera further back to fit three lanes
    camera.fov = camera.aspect < 1 ? 70 : 55;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camDist = THREE.MathUtils.clamp(2.75 / (halfHeight * camera.aspect), 6.4, 9.5);
    camera.updateProjectionMatrix();
}
addEventListener("resize", layout);
layout();

// ---------------------------------------------------------------------------
// Textures drawn in code (no image files to load)
// ---------------------------------------------------------------------------
function canvasTexture(width, height, draw, repeatX = 1, repeatY = 1) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    draw(c.getContext("2d"), width, height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
}

// Fixed pseudo-random numbers, so the textures look the same every time
function seeded(seed) {
    return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

const ROAD_W = 7.2;
const ROAD_LEN = 150;
const ROAD_Z = -ROAD_LEN / 2 + 14; // the road runs from behind the camera to the far fog
const TILE = 8; // world units per repeat of the road texture

const roadTex = canvasTexture(256, 256, (g, w, h) => {
    const rnd = seeded(7);
    g.fillStyle = "#2b2833";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
        g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.12)";
        g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    g.fillStyle = "#6b6775";
    for (const x of [(ROAD_W / 2 - 1.1) / ROAD_W, (ROAD_W / 2 + 1.1) / ROAD_W]) g.fillRect(x * w - 3, 0, 6, h * 0.55);
    g.fillStyle = "#d8fd71";
    g.fillRect(0, 0, 6, h);
    g.fillRect(w - 6, 0, 6, h);
}, 1, ROAD_LEN / TILE);

const pavementTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = "#47424f";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(0, 0, w, 3);
    g.fillRect(0, h / 2, w, 3);
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.fillRect(0, 3, w, 2);
}, 1, ROAD_LEN / 4);

const brickTex = canvasTexture(256, 256, (g, w, h) => {
    const rnd = seeded(11);
    g.fillStyle = "#151019";
    g.fillRect(0, 0, w, h);
    const bh = 32;
    const bw = 64;
    for (let row = 0; row < h / bh; row++) {
        const shift = row % 2 ? bw / 2 : 0;
        for (let x = -bw; x < w + bw; x += bw) {
            const t = 30 + rnd() * 16;
            g.fillStyle = `rgb(${t + 10}, ${t - 4}, ${t + 22})`;
            g.fillRect(x + shift + 2, row * bh + 2, bw - 4, bh - 4);
        }
    }
});

function wallTexture(sign) {
    const t = brickTex.clone();
    t.needsUpdate = true;
    t.repeat.set(ROAD_LEN / 8, 9 / 8);
    t.userData.sign = sign;
    return t;
}

const glowTex = canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.25)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
});
glowTex.wrapS = glowTex.wrapT = THREE.ClampToEdgeWrapping;

const skylineTex = canvasTexture(1024, 256, (g, w, h) => {
    const rnd = seeded(3);
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#1a1426");
    sky.addColorStop(0.7, "#3b1d52");
    sky.addColorStop(1, "#6a2a6e");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w;) {
        const bw = 30 + rnd() * 60;
        const bh = 60 + rnd() * 150;
        g.fillStyle = "#120d1c";
        g.fillRect(x, h - bh, bw, bh);
        for (let wy = h - bh + 8; wy < h - 6; wy += 12) {
            for (let wx = x + 6; wx < x + bw - 6; wx += 10) {
                if (rnd() < 0.22) {
                    g.fillStyle = ["#ff3df2", "#2de2e6", "#ffcf4d", "#b967ff"][Math.floor(rnd() * 4)];
                    g.globalAlpha = 0.55;
                    g.fillRect(wx, wy, 4, 5);
                    g.globalAlpha = 1;
                }
            }
        }
        x += bw + 4;
    }
});
skylineTex.wrapS = skylineTex.wrapT = THREE.ClampToEdgeWrapping;

function signTexture(text, color) {
    const t = canvasTexture(512, 160, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = "rgba(10,8,16,0.85)";
        g.beginPath();
        g.roundRect(8, 8, w - 16, h - 16, 24);
        g.fill();
        g.lineWidth = 8;
        g.strokeStyle = color;
        g.shadowColor = color;
        g.shadowBlur = 24;
        g.stroke();
        g.font = "700 72px 'Chakra Petch', system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "#ffffff";
        g.fillText(text, w / 2, h / 2 + 4);
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
}

const barrierTex = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = "#ff4757";
    g.fillRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.rect(0, h * 0.32, w, h * 0.36);
    g.clip();
    g.fillStyle = "#ffffff";
    for (let x = -h; x < w + h; x += 48) {
        g.beginPath();
        g.moveTo(x, h * 0.68);
        g.lineTo(x + 24, h * 0.68);
        g.lineTo(x + 24 + h * 0.36, h * 0.32);
        g.lineTo(x + h * 0.36, h * 0.32);
        g.closePath();
        g.fill();
    }
    g.restore();
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(0, h * 0.86, w, h * 0.14);
});
barrierTex.wrapS = barrierTex.wrapT = THREE.ClampToEdgeWrapping;

// ---------------------------------------------------------------------------
// The alley
// ---------------------------------------------------------------------------
const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_W, ROAD_LEN),
    new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 }),
);
road.rotation.x = -Math.PI / 2;
road.position.z = ROAD_Z;
road.receiveShadow = true;
scene.add(road);

const pavementMat = new THREE.MeshStandardMaterial({ map: pavementTex, roughness: 0.95 });
for (const side of [-1, 1]) {
    const pavement = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, ROAD_LEN), pavementMat);
    pavement.position.set(side * (ROAD_W / 2 + 0.85), 0.09, ROAD_Z);
    pavement.receiveShadow = true;
    scene.add(pavement);
}

const walls = [-1, 1].map((side) => {
    const tex = wallTexture(side);
    const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_LEN, 9),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }),
    );
    wall.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    wall.position.set(side * (ROAD_W / 2 + 1.7), 4.5, ROAD_Z);
    wall.receiveShadow = true;
    scene.add(wall);
    return wall;
});

const skyline = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 65),
    new THREE.MeshBasicMaterial({ map: skylineTex, fog: false }),
);
skyline.position.set(0, 24, -100);
scene.add(skyline);

// Neon strips and signs on the walls. They are recycled as they pass the camera.
const NEON = ["#ff3df2", "#2de2e6", "#b967ff", "#ffcf4d"];
const SIGN_WORDS = ["ALLEY", "ARCADE", "OPEN 24/7", "VELOCITY", "SPEED RUN", "NEON"];
const DECOR_SPACING = 9;
const DECOR_COUNT = 10;
const decor = [];
const signs = [];
const stripGeo = new THREE.BoxGeometry(0.12, 2.6, 0.16);
const glowGeo = new THREE.PlaneGeometry(1.2, 3.6);
const signGeo = new THREE.PlaneGeometry(2.6, 0.81);

function makeDecor(i) {
    const side = i % 2 ? 1 : -1;
    const color = NEON[i % NEON.length];
    const group = new THREE.Group();
    const x = side * (ROAD_W / 2 + 1.62);
    if (i % 3 === 2) {
        const text = SIGN_WORDS[i % SIGN_WORDS.length];
        const sign = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map: signTexture(text, color), transparent: true }));
        signs.push({ sign, text, color });
        sign.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        sign.position.set(x, 3.6, 0);
        group.add(sign);
    } else {
        const strip = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ color }));
        strip.position.set(x, 3.4, 0);
        const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
            map: glowTex, color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        glow.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        glow.position.set(x - side * 0.05, 3.4, 0);
        group.add(strip, glow);
    }
    group.position.z = 10 - i * DECOR_SPACING;
    scene.add(group);
    decor.push(group);
}
for (let i = 0; i < DECOR_COUNT; i++) makeDecor(i);

// Redraw the sign lettering once the game's font has loaded
document.fonts?.load("700 72px 'Chakra Petch'").then(() => {
    for (const { sign, text, color } of signs) {
        sign.material.map.dispose();
        sign.material.map = signTexture(text, color);
        sign.material.needsUpdate = true;
    }
}).catch(() => {});

// ---------------------------------------------------------------------------
// The character, built from simple shapes. It faces away from the camera,
// the same view start.ng uses in the Hangout.
// ---------------------------------------------------------------------------
const INK_MAT = new THREE.MeshStandardMaterial({ color: "#1b1b22", roughness: 0.6 });
const GOLD_MAT = new THREE.MeshStandardMaterial({ color: "#ffcf4d", roughness: 0.3, metalness: 0.4, emissive: "#5a3c00" });

function createCharacter() {
    const mats = {
        primary: new THREE.MeshStandardMaterial({ roughness: 0.75 }),
        primaryDark: new THREE.MeshStandardMaterial({ roughness: 0.75 }),
        secondary: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
        secondaryDark: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
        skin: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
        hair: new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }),
    };
    const HY = 1.86; // head centre

    const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        return m;
    };

    const root = new THREE.Group();
    const body = new THREE.Group(); // bobs and leans while running
    root.add(body);

    // Legs: pivot at the hip so rotation.x swings them
    const legGeo = new THREE.CapsuleGeometry(0.11, 0.62, 4, 12);
    const shoeGeo = new THREE.BoxGeometry(0.2, 0.11, 0.32);
    const makeLeg = (x) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, 0.92, 0);
        pivot.add(mesh(legGeo, mats.secondary, 0, -0.42, 0));
        pivot.add(mesh(shoeGeo, INK_MAT, 0, -0.86, -0.05));
        body.add(pivot);
        return pivot;
    };
    const legL = makeLeg(-0.12);
    const legR = makeLeg(0.12);

    // Body shapes for each body type
    const maleTorso = mesh(new THREE.CylinderGeometry(0.31, 0.25, 0.64, 20), mats.primary, 0, 1.3, 0);
    maleTorso.scale.z = 0.56;
    const malePelvis = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 20), mats.secondary, 0, 0.98, 0);
    malePelvis.scale.z = 0.6;
    const femaleTorso = mesh(new THREE.CylinderGeometry(0.27, 0.21, 0.62, 20), mats.primary, 0, 1.31, 0);
    femaleTorso.scale.z = 0.56;
    const femalePelvis = mesh(new THREE.CylinderGeometry(0.22, 0.29, 0.24, 20), mats.secondary, 0, 0.98, 0);
    femalePelvis.scale.z = 0.62;
    body.add(maleTorso, malePelvis, femaleTorso, femalePelvis);

    // Arms: a puffy short sleeve, a bare arm and a hand
    const sleeveGeo = new THREE.SphereGeometry(0.13, 16, 12);
    const armGeo = new THREE.CapsuleGeometry(0.062, 0.42, 4, 10);
    const handGeo = new THREE.SphereGeometry(0.075, 12, 10);
    const makeArm = () => {
        const pivot = new THREE.Group();
        pivot.add(mesh(sleeveGeo, mats.primary, 0, -0.04, 0));
        pivot.add(mesh(armGeo, mats.skin, 0, -0.32, 0));
        pivot.add(mesh(handGeo, mats.skin, 0, -0.6, 0));
        body.add(pivot);
        return pivot;
    };
    const armL = makeArm();
    const armR = makeArm();

    // Neck, head and ears
    body.add(mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.16, 12), mats.skin, 0, 1.64, 0));
    const head = mesh(new THREE.SphereGeometry(0.24, 24, 18), mats.skin, 0, HY, 0);
    head.scale.y = 1.08;
    body.add(head);
    const earGeo = new THREE.SphereGeometry(0.05, 10, 8);
    body.add(mesh(earGeo, mats.skin, -0.235, HY - 0.02, 0.01), mesh(earGeo, mats.skin, 0.235, HY - 0.02, 0.01));
    // Eyes on the front of the face
    const eyeGeo = new THREE.SphereGeometry(0.028, 8, 6);
    body.add(mesh(eyeGeo, INK_MAT, -0.085, HY + 0.03, -0.225), mesh(eyeGeo, INK_MAT, 0.085, HY + 0.03, -0.225));

    // Slots rebuilt when the style changes
    const hairSlot = new THREE.Group();
    const hatSlot = new THREE.Group();
    const accessorySlot = new THREE.Group();
    body.add(hairSlot, hatSlot, accessorySlot);
    let braidGroup = null;
    let tailPivot = null;

    const HAIR_R = 0.262;
    const cap = () => {
        const m = mesh(new THREE.SphereGeometry(HAIR_R, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mats.hair, 0, HY + 0.01, 0.01);
        m.scale.y = 1.08;
        return m;
    };
    // The back of the head, from the crown down; theta 0..PI covers the half facing the camera
    const back = (length) => {
        const m = mesh(new THREE.SphereGeometry(HAIR_R, 28, 10, 0, Math.PI, Math.PI / 2, Math.PI * length), mats.hair, 0, HY + 0.01, 0.01);
        m.scale.y = 1.08;
        return m;
    };
    const strandsAround = (count, from, to, radius, strandR, length, topY) => {
        const group = new THREE.Group();
        group.position.set(0, topY, 0);
        for (let i = 0; i < count; i++) {
            const a = Math.PI * (from + ((to - from) * i) / (count - 1));
            const len = length * (0.92 + ((i * 37) % 10) / 60);
            const strand = mesh(new THREE.CylinderGeometry(strandR, strandR * 0.8, len, 6), mats.hair,
                -Math.cos(a) * radius, -len / 2, Math.sin(a) * radius);
            group.add(strand);
        }
        return group;
    };

    const hairs = {
        bald: () => [],
        short: () => [cap(), back(0.36)],
        afro: () => {
            const m = mesh(new THREE.SphereGeometry(0.4, 24, 18), mats.hair, 0, HY + 0.08, 0.04);
            m.scale.y = 0.92;
            return [m];
        },
        braids: () => {
            braidGroup = strandsAround(16, 0.1, 0.9, 0.245, 0.028, 0.66, HY);
            return [cap(), back(0.62), braidGroup];
        },
        dreads: () => {
            braidGroup = strandsAround(11, 0.04, 0.96, 0.255, 0.048, 0.52, HY);
            return [cap(), back(0.55), braidGroup];
        },
        bun: () => [cap(), back(0.5), mesh(new THREE.SphereGeometry(0.13, 16, 12), mats.hair, 0, HY + 0.2, 0.15)],
        ponytail: () => {
            const tie = mesh(new THREE.TorusGeometry(0.055, 0.022, 8, 16), mats.primary, 0, HY + 0.05, 0.27);
            tailPivot = new THREE.Group();
            tailPivot.position.set(0, HY + 0.04, 0.29);
            tailPivot.add(mesh(new THREE.CylinderGeometry(0.07, 0.035, 0.55, 10), mats.hair, 0, -0.27, 0));
            return [cap(), back(0.5), tie, tailPivot];
        },
    };

    const hats = {
        none: () => [],
        cap: () => {
            const dome = mesh(new THREE.SphereGeometry(0.278, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.secondary, 0, 0.03, 0);
            dome.scale.y = 0.85;
            return [dome, mesh(new THREE.BoxGeometry(0.38, 0.03, 0.26), mats.secondaryDark, 0, 0.04, -0.33),
                mesh(new THREE.SphereGeometry(0.03, 8, 6), mats.secondaryDark, 0, 0.27, 0)];
        },
        beanie: () => {
            const dome = mesh(new THREE.SphereGeometry(0.282, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mats.secondary, 0, 0.02, 0);
            dome.scale.y = 1.1;
            const cuff = mesh(new THREE.CylinderGeometry(0.287, 0.287, 0.09, 28, 1, true), mats.secondaryDark, 0, 0.02, 0);
            cuff.material = mats.secondaryDark;
            return [dome, cuff];
        },
        tophat: () => [
            mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 28), INK_MAT, 0, 0.17, 0),
            mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 28), INK_MAT, 0, 0.39, 0),
            mesh(new THREE.CylinderGeometry(0.226, 0.226, 0.07, 28), mats.secondary, 0, 0.22, 0),
        ],
        crown: () => [
            mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.13, 10, 1, true), GOLD_MAT, 0, 0.2, 0),
            ...Array.from({ length: 5 }, (_, i) => {
                const a = (i / 5) * Math.PI * 2;
                return mesh(new THREE.ConeGeometry(0.045, 0.13, 4), GOLD_MAT, Math.sin(a) * 0.21, 0.32, Math.cos(a) * 0.21);
            }),
            mesh(new THREE.SphereGeometry(0.035, 10, 8), mats.primary, 0, 0.2, 0.235),
        ],
    };

    const accessories = {
        none: () => [],
        glasses: () => {
            const lens = new THREE.TorusGeometry(0.06, 0.012, 6, 16);
            const temple = new THREE.BoxGeometry(0.014, 0.014, 0.26);
            return [mesh(lens, INK_MAT, -0.09, HY + 0.03, -0.235), mesh(lens, INK_MAT, 0.09, HY + 0.03, -0.235),
                mesh(temple, INK_MAT, -0.25, HY + 0.035, -0.12), mesh(temple, INK_MAT, 0.25, HY + 0.035, -0.12)];
        },
        earrings: () => {
            const ring = new THREE.SphereGeometry(0.035, 10, 8);
            return [mesh(ring, GOLD_MAT, -0.255, HY - 0.1, 0.01), mesh(ring, GOLD_MAT, 0.255, HY - 0.1, 0.01)];
        },
        beard: () => {
            const beard = mesh(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.4), mats.hair, 0, HY - 0.02, -0.04);
            beard.scale.set(1.2, 1.2, 1.25);
            return [beard];
        },
        scarf: () => {
            const ring = mesh(new THREE.TorusGeometry(0.15, 0.06, 10, 24), mats.secondary, 0, 1.6, 0);
            ring.rotation.x = Math.PI / 2;
            return [ring, mesh(new THREE.BoxGeometry(0.12, 0.34, 0.05), mats.secondaryDark, 0.09, 1.42, 0.2)];
        },
        backpack: () => [
            mesh(new THREE.BoxGeometry(0.46, 0.52, 0.2), mats.secondary, 0, 1.25, 0.25),
            mesh(new THREE.BoxGeometry(0.47, 0.14, 0.21), mats.secondaryDark, 0, 1.47, 0.255),
            mesh(new THREE.BoxGeometry(0.3, 0.16, 0.04), mats.secondaryDark, 0, 1.1, 0.36),
            mesh(new THREE.BoxGeometry(0.06, 0.04, 0.36), mats.secondaryDark, -0.17, 1.55, 0.06),
            mesh(new THREE.BoxGeometry(0.06, 0.04, 0.36), mats.secondaryDark, 0.17, 1.55, 0.06),
        ],
    };

    const fill = (slot, parts) => {
        for (const child of [...slot.children]) {
            slot.remove(child);
            child.traverse((o) => o.geometry?.dispose());
        }
        if (parts.length) slot.add(...parts);
    };

    let current = {};
    function applyStyle(next) {
        const s = cleanStyle(next);
        mats.primary.color.set(s.primaryColor);
        mats.primaryDark.color.set(s.primaryColor).multiplyScalar(0.8);
        mats.secondary.color.set(s.secondaryColor);
        mats.secondaryDark.color.set(s.secondaryColor).multiplyScalar(0.75);
        mats.skin.color.set(s.skinColor);
        mats.hair.color.set(s.hairColor);

        const female = s.body === "female";
        maleTorso.visible = malePelvis.visible = !female;
        femaleTorso.visible = femalePelvis.visible = female;
        const shoulder = female ? 0.3 : 0.34;
        armL.position.set(-shoulder, 1.55, 0);
        armR.position.set(shoulder, 1.55, 0);

        if (s.hair !== current.hair) {
            braidGroup = null;
            tailPivot = null;
            fill(hairSlot, (hairs[s.hair] ?? hairs.short)());
        }
        if (s.hat !== current.hat || s.hair !== current.hair) {
            fill(hatSlot, (hats[s.hat] ?? hats.none)());
            const afro = s.hair === "afro";
            hatSlot.position.set(0, HY + (afro ? 0.17 : 0), afro ? 0.03 : 0);
            hatSlot.scale.setScalar(afro ? 1.38 : 1);
        }
        if (s.accessory !== current.accessory) fill(accessorySlot, (accessories[s.accessory] ?? accessories.none)());
        current = s;
    }

    let phase = 0;
    function animate(dt, { running, speed, tilt, crashT }) {
        if (crashT !== null) {
            // Knocked back by the barrier
            const k = Math.min(1, crashT / 0.35);
            body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, 0.55, k);
            root.position.z = THREE.MathUtils.lerp(root.position.z, 0.55, k);
            legL.rotation.x = THREE.MathUtils.lerp(legL.rotation.x, -0.5, k);
            legR.rotation.x = THREE.MathUtils.lerp(legR.rotation.x, 0.2, k);
            armL.rotation.x = armR.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, -2.2, k);
            return;
        }
        root.position.z = 0;
        if (running) {
            phase += dt * (6 + speed * 0.28);
            const swing = Math.sin(phase);
            legL.rotation.x = swing * 0.85;
            legR.rotation.x = -swing * 0.85;
            armL.rotation.x = -swing * 0.75;
            armR.rotation.x = swing * 0.75;
            body.position.y = Math.abs(Math.cos(phase)) * 0.07;
            body.rotation.x = -0.1;
        } else {
            phase += dt * 2;
            legL.rotation.x = legR.rotation.x = 0;
            armL.rotation.x = armR.rotation.x = Math.sin(phase) * 0.04;
            body.position.y = (Math.sin(phase) + 1) * 0.01;
            body.rotation.x = 0;
        }
        root.rotation.z = tilt;
        // Hair flows back while running
        const flow = running ? -0.16 + Math.sin(phase * 2) * 0.05 : -0.02;
        if (braidGroup) braidGroup.rotation.x = flow;
        if (tailPivot) tailPivot.rotation.x = flow * 1.6 - 0.2;
    }

    function reset() {
        body.rotation.set(0, 0, 0);
        root.position.set(0, 0, 0);
    }

    return { root, applyStyle, animate, reset };
}

const character = createCharacter();
scene.add(character.root);

// ---------------------------------------------------------------------------
// Barriers and coins
// ---------------------------------------------------------------------------
const LANE_X = [-2.2, 0, 2.2];
const SPAWN_Z = -78;
const barrierGeo = new THREE.BoxGeometry(1.9, 1.05, 0.55);
const barrierMat = new THREE.MeshStandardMaterial({ map: barrierTex, roughness: 0.45 });
const lampGeo = new THREE.SphereGeometry(0.07, 10, 8);
const lampMat = new THREE.MeshBasicMaterial({ color: "#ffb02e" });
const coinGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.08, 28);
coinGeo.rotateX(Math.PI / 2);
const coinRimGeo = new THREE.TorusGeometry(0.33, 0.035, 8, 28);
const coinMat = new THREE.MeshStandardMaterial({ color: "#ffd24d", roughness: 0.25, metalness: 0.3, emissive: "#a87400", emissiveIntensity: 0.9 });
const coinRimMat = new THREE.MeshStandardMaterial({ color: "#e0a419", roughness: 0.35, metalness: 0.35, emissive: "#5a3c00" });

const barrierPool = [];
const coinPool = [];
let barriers = []; // { obj, lane, z }
let coinsOnRoad = []; // { obj, lane, z, takenT }

function takeBarrier() {
    let obj = barrierPool.pop();
    if (!obj) {
        obj = new THREE.Group();
        const block = new THREE.Mesh(barrierGeo, barrierMat);
        block.position.y = 0.525;
        block.castShadow = true;
        block.receiveShadow = true;
        obj.add(block, new THREE.Mesh(lampGeo, lampMat), new THREE.Mesh(lampGeo, lampMat));
        obj.children[1].position.set(-0.8, 1.12, 0);
        obj.children[2].position.set(0.8, 1.12, 0);
        scene.add(obj);
    }
    obj.visible = true;
    return obj;
}

function takeCoin() {
    let obj = coinPool.pop();
    if (!obj) {
        obj = new THREE.Group();
        const face = new THREE.Mesh(coinGeo, coinMat);
        face.castShadow = true;
        obj.add(face, new THREE.Mesh(coinRimGeo, coinRimMat));
        scene.add(obj);
    }
    obj.visible = true;
    obj.scale.setScalar(1);
    return obj;
}

function addBarrier(lane, z) {
    const obj = takeBarrier();
    obj.position.set(LANE_X[lane], 0, z);
    barriers.push({ obj, lane, z });
}

function addCoin(lane, z) {
    const obj = takeCoin();
    obj.position.set(LANE_X[lane], 0.85, z);
    coinsOnRoad.push({ obj, lane, z, takenT: null });
}

// Rows of barriers are placed a gap apart. A row never blocks all three lanes,
// two-lane rows never come back to back, and coin trails run between rows in a
// lane that is open at both ends.
let rowCursorZ = 0;
let lastRow = { z: 0, free: [0, 1, 2], double: false };

function rowGap() {
    return THREE.MathUtils.clamp(15 - (speed - 14) * 0.28, 10.5, 15);
}

function spawnRow(z) {
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const double = !lastRow.double && distance > 120 && Math.random() < 0.4;
    const blocked = lanes.slice(0, double ? 2 : 1);
    const free = [0, 1, 2].filter((l) => !blocked.includes(l));
    for (const l of blocked) addBarrier(l, z);

    const open = free.filter((l) => lastRow.free.includes(l));
    if (open.length && Math.random() < 0.8) {
        const lane = open[Math.floor(Math.random() * open.length)];
        for (let cz = lastRow.z - 3; cz > z + 3; cz -= 1.5) addCoin(lane, cz);
    }
    lastRow = { z, free, double };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------
const START_SPEED = 14;
let state = "playing"; // "playing" | "crashed" | "summary"
let lane = 1;
let px = 0;
let speed = START_SPEED;
let distance = 0;
let coins = 0;
let crashT = null;
let shake = 0;
let runTime = 0;
let firstRun = true;
let summaryTimer = null;
let runResult = null; // a promise for what start.ng said about this run

function clearRoad() {
    for (const b of barriers) { b.obj.visible = false; barrierPool.push(b.obj); }
    for (const c of coinsOnRoad) { c.obj.visible = false; coinPool.push(c.obj); }
    barriers = [];
    coinsOnRoad = [];
}

function resetRun() {
    clearRoad();
    state = "playing";
    lane = 1;
    px = 0;
    speed = START_SPEED;
    distance = 0;
    coins = 0;
    crashT = null;
    shake = 0;
    runTime = 0;
    runResult = null;
    character.reset();
    ui.coins.textContent = "0";
    ui.distance.textContent = "0";
    ui.summary.hidden = true;
    ui.summary.classList.remove("show");
    updateSignInButtons();
    // Fill the road ahead, leaving a clear stretch at the start
    lastRow = { z: -14, free: [0, 1, 2], double: false };
    rowCursorZ = -30;
    while (rowCursorZ > SPAWN_Z) {
        spawnRow(rowCursorZ);
        rowCursorZ -= rowGap();
    }
}

function move(dir) {
    if (state !== "playing") return;
    lane = THREE.MathUtils.clamp(lane + dir, 0, 2);
}

function crash() {
    state = "crashed";
    crashT = 0;
    shake = 0.35;
    runResult = saveRun(Math.floor(distance), coins);
    summaryTimer = setTimeout(showSummary, 850);
}

function update(dt) {
    if (state === "crashed" || state === "summary") {
        if (crashT !== null) crashT += dt;
        return;
    }
    runTime += dt;
    speed = Math.min(32, START_SPEED + distance / 70);
    const step = speed * dt;
    distance += step;

    const target = LANE_X[lane];
    px += (target - px) * (1 - Math.exp(-dt * 14));

    // Move everything towards the camera
    rowCursorZ += step;
    lastRow.z += step;
    while (rowCursorZ > SPAWN_Z + rowGap()) {
        rowCursorZ -= rowGap();
        spawnRow(rowCursorZ);
    }

    for (let i = barriers.length - 1; i >= 0; i--) {
        const b = barriers[i];
        b.z += step;
        b.obj.position.z = b.z;
        if (Math.abs(b.z) < 0.55 && Math.abs(LANE_X[b.lane] - px) < 1.15) {
            crash();
            return;
        }
        if (b.z > 8) {
            b.obj.visible = false;
            barrierPool.push(b.obj);
            barriers.splice(i, 1);
        }
    }

    for (let i = coinsOnRoad.length - 1; i >= 0; i--) {
        const c = coinsOnRoad[i];
        c.z += step;
        c.obj.position.z = c.z;
        if (c.takenT === null) {
            c.obj.rotation.y += dt * 3;
            c.obj.position.y = 0.85 + Math.sin(runTime * 4 + c.z * 0.5) * 0.06;
            if (Math.abs(c.z) < 0.75 && Math.abs(LANE_X[c.lane] - px) < 0.9) {
                c.takenT = 0;
                coins++;
                ui.coins.textContent = String(coins);
                ui.coinsPill.classList.remove("pop");
                void ui.coinsPill.offsetWidth; // restart the pop animation
                ui.coinsPill.classList.add("pop");
            }
        } else {
            c.takenT += dt;
            c.obj.position.y += dt * 4;
            c.obj.rotation.y += dt * 14;
            c.obj.scale.setScalar(Math.max(0.01, 1 - c.takenT * 4));
        }
        if (c.z > 3 || (c.takenT !== null && c.takenT > 0.25)) {
            c.obj.visible = false;
            coinPool.push(c.obj);
            coinsOnRoad.splice(i, 1);
        }
    }

    // Scroll the road, pavements and walls, and recycle the wall decorations
    roadTex.offset.y = (distance / TILE) % 1;
    pavementTex.offset.y = (distance / 4) % 1;
    for (const wall of walls) wall.material.map.offset.x = ((wall.material.map.userData.sign < 0 ? 1 : -1) * distance / 8) % 1;
    for (const d of decor) {
        d.position.z += step;
        if (d.position.z > 12) d.position.z -= DECOR_COUNT * DECOR_SPACING;
    }

    ui.distance.textContent = String(Math.floor(distance));
    if (firstRun && runTime > 3.5) ui.hint.classList.add("gone");
}

function render(dt) {
    character.root.position.x = px;
    character.animate(dt, {
        running: state === "playing",
        speed,
        tilt: THREE.MathUtils.clamp((px - LANE_X[lane]) * 0.12, -0.25, 0.25),
        crashT,
    });

    // The camera follows the runner a little from behind and above
    const camX = px * 0.55;
    camera.position.set(camX, 2.3 + camDist * 0.32, camDist);
    if (shake > 0) {
        shake = Math.max(0, shake - dt);
        camera.position.x += (Math.random() - 0.5) * shake * 0.6;
        camera.position.y += (Math.random() - 0.5) * shake * 0.6;
    }
    // On tall screens look a little higher, so the runner sits low and more road shows ahead
    camera.lookAt(camX * 0.7, camera.aspect < 1 ? 2.9 : 1.1, -7);
    sun.position.set(px + 4, 10, 6);
    sun.target.position.set(px, 0, -2);

    renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Saving the run and the summary card
// ---------------------------------------------------------------------------
const BEST_KEY = "alley-velocity:best";

function localBest(run) {
    let best = { distance: 0, coins: 0 };
    try {
        best = { ...best, ...JSON.parse(localStorage.getItem(BEST_KEY) || "{}") };
        if (run.distance > best.distance || (run.distance === best.distance && run.coins > best.coins)) {
            best = run;
            localStorage.setItem(BEST_KEY, JSON.stringify(best));
        }
    } catch {
        if (run.distance > best.distance) best = run;
    }
    return best;
}

async function saveRun(runDistance, runCoins) {
    const run = { distance: runDistance, coins: runCoins };
    const stats = { distance: Math.min(runDistance, 1000000000), coins: Math.min(runCoins, 1000000000) };
    let saved = null;
    let message;

    if (!ON_START_NG) {
        message = "Play on start.ng to save your run";
    } else if (!player.signedIn) {
        message = "Sign in to save your run and join the board";
    } else {
        const reply = await askStartNg({ type: "startng:score", stats }, "startng:scoreSaved", 8000);
        if (reply?.ok) {
            saved = reply.result;
            message = saved.improved ? `New best! You are #${saved.rank}.` : `Not your best this time. You are #${saved.rank}.`;
        } else {
            message = reply?.error || "Couldn't save your run. Check your connection.";
        }
    }

    const best = saved?.stats ?? localBest(run);
    const board = ON_START_NG ? await askStartNg({ type: "startng:leaderboard", limit: 5 }, "startng:leaderboardData", 8000) : null;
    return { run, best, saved, message, entries: board?.ok ? board.entries : null };
}

function cell(text, className) {
    const td = document.createElement("td");
    td.textContent = text;
    if (className) td.className = className;
    return td;
}

function boardRow(rank, name, stats, isMe) {
    const tr = document.createElement("tr");
    if (isMe) tr.className = "me";
    tr.append(
        cell(String(rank), "rank"),
        cell(name, "player"),
        cell(`${stats?.distance ?? 0} m`),
        cell(String(stats?.coins ?? 0)),
    );
    return tr;
}

function renderBoard(result) {
    const entries = result.entries;
    ui.boardRows.replaceChildren();
    if (!entries?.length) {
        ui.board.hidden = true;
        return;
    }
    let meShown = false;
    for (const e of entries) {
        const isMe = player.id !== null && e.player_id === player.id;
        meShown ||= isMe;
        const stats = e.stats ?? { distance: e.score, coins: 0 };
        ui.boardRows.append(boardRow(e.rank, e.name, stats, isMe));
    }
    // Outside the top five? Show where you are underneath.
    if (!meShown && result.saved?.rank) {
        const gap = document.createElement("tr");
        gap.className = "gap";
        const td = cell("⋯");
        td.colSpan = 4;
        gap.append(td);
        ui.boardRows.append(gap, boardRow(result.saved.rank, player.name, result.saved.stats, true));
    }
    ui.board.hidden = false;
}

function setNumber(el, value, unit) {
    el.replaceChildren(String(value));
    if (unit) {
        const small = document.createElement("small");
        small.textContent = unit;
        el.append(small);
    }
}

async function showSummary() {
    state = "summary";
    const runDistance = Math.floor(distance);
    setNumber(ui.sDistance, runDistance, "m");
    setNumber(ui.sCoins, coins);
    setNumber(ui.sBest, "–");
    ui.sMessage.textContent = ON_START_NG && player.signedIn ? "Saving your run…" : "";
    ui.board.hidden = true;
    ui.signin.hidden = true;
    ui.summary.hidden = false;
    ui.summary.classList.add("show");

    const result = await runResult;
    if (state !== "summary") return; // already playing again
    setNumber(ui.sBest, result.best.distance, "m");
    ui.sMessage.textContent = result.message;
    renderBoard(result);
}

function playAgain() {
    clearTimeout(summaryTimer);
    if (state === "playing") return;
    resetRun();
}

// ---------------------------------------------------------------------------
// Who's playing
// ---------------------------------------------------------------------------
let player = { id: null, signedIn: false, name: "Guest", account: "", style: cleanStyle(null), face: null };

function updateSignInButtons() {
    const guestOnStartNg = ON_START_NG && !player.signedIn;
    ui.signin.hidden = !guestOnStartNg || state !== "playing";
    ui.sSignin.hidden = !guestOnStartNg;
}

function applyPlayer(reply) {
    const user = reply?.user ?? null;
    const who = user ?? reply?.guest ?? null;
    const face = typeof who?.face === "string" && who.face.startsWith("data:image/") ? who.face : null;
    player = {
        id: user?.id ?? null,
        signedIn: !!user,
        name: who?.name || "Guest",
        account: user?.account || "",
        style: cleanStyle(who?.style),
        face,
    };
    ui.name.textContent = player.name;
    ui.account.textContent = player.account ? `@${player.account}` : "Not signed in";
    ui.face.hidden = !face;
    if (face && ui.face.src !== face) ui.face.src = face;
    character.applyStyle(player.style);
    updateSignInButtons();
}

async function refreshPlayer() {
    const reply = await askStartNg({ type: "startng:whoami" }, "startng:user");
    if (reply) applyPlayer(reply); // if start.ng didn't answer, keep the current player
}

// ---------------------------------------------------------------------------
// Controls: tap either side of the screen, or use the keyboard
// ---------------------------------------------------------------------------
canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    move(e.clientX < innerWidth / 2 ? -1 : 1);
});

addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLButtonElement && (e.key === " " || e.key === "Enter")) return; // let buttons work
    if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") move(-1);
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") move(1);
    if ((e.key === " " || e.key === "Enter") && state === "summary") playAgain();
});

ui.again.addEventListener("click", playAgain);
ui.signin.addEventListener("click", signIn);
ui.sSignin.addEventListener("click", signIn);

// The player may have signed in or out on start.ng while away from this tab.
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshPlayer();
});
addEventListener("focus", refreshPlayer);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
applyPlayer(null);
refreshPlayer();
resetRun();

const clock = new THREE.Clock();
function frameLoop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    update(dt);
    render(dt);
    requestAnimationFrame(frameLoop);
}
requestAnimationFrame(() => {
    ui.loading.hidden = true;
    frameLoop();
});
