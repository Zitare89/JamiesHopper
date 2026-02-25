const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const startScreenEl = document.getElementById("start-screen");
const startGameBtn = document.getElementById("start-game");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const restartBtn = document.getElementById("restart");
const BEST_SCORE_KEY = "spill1_best_score";

const PLAYER_IMAGE_W = 1024;
const PLAYER_IMAGE_H = 1024;

const SHIP_X = 24;
const SHIP_W = 122;
const SHIP_H = 50;
const INTRO_SHIP_HOLD_MS = 1500;
const INTRO_DROP_MS = 420;

const TERRAIN_START_Y = 500;
const TERRAIN_MIN_Y = 350;
const TERRAIN_MAX_Y = 585;
const TERRAIN_SAMPLE_STEP = 24;

const playerSprite = new Image();
const playerSpriteCanvas = document.createElement("canvas");
const playerSpriteCtx = playerSpriteCanvas.getContext("2d", { willReadFrequently: true });
let playerSpriteReady = false;

playerSprite.src = "assets/eimaj.png";
playerSprite.onload = () => {
  playerSpriteCanvas.width = playerSprite.width;
  playerSpriteCanvas.height = playerSprite.height;
  playerSpriteCtx.clearRect(0, 0, playerSprite.width, playerSprite.height);
  playerSpriteCtx.drawImage(playerSprite, 0, 0);

  const imageData = playerSpriteCtx.getImageData(0, 0, playerSprite.width, playerSprite.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r < 14 && g < 14 && b < 14) {
      data[i + 3] = 0;
    }
  }
  playerSpriteCtx.putImageData(imageData, 0, 0);
  playerSpriteReady = true;
};

const state = {
  player: {
    x: 90,
    y: 0,
    w: 36,
    h: 42,
    vy: 0,
    jumpForce: 14.5,
  },
  obstacles: [],
  score: 0,
  best: 0,
  running: false,
  sessionStarted: false,
  introActive: false,
  introStartAt: 0,
  lastSpawnAt: 0,
  speed: 7.2,
  startedAt: 0,
  worldOffset: 0,
  terrainSegments: [],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function createTerrainSegment(start, yStart, length, slope) {
  return {
    start,
    end: start + length,
    yStart,
    slope,
    yEnd: yStart + slope * length,
  };
}

function initializeTerrain() {
  state.terrainSegments = [];
  const first = createTerrainSegment(0, TERRAIN_START_Y, 280, 0.08);
  state.terrainSegments.push(first);
  fillTerrainTo(5000);
}

function fillTerrainTo(worldX) {
  while (state.terrainSegments[state.terrainSegments.length - 1].end < worldX) {
    const prev = state.terrainSegments[state.terrainSegments.length - 1];
    const length = 140 + Math.random() * 180;
    const isFlat = Math.random() < 0.02;
    let slope = isFlat ? 0 : 0.18 + Math.random() * 0.18;

    if (prev.yEnd < TERRAIN_MIN_Y + 24) {
      slope = 0.16 + Math.random() * 0.16;
    }
    if (prev.yEnd > TERRAIN_MAX_Y - 24) {
      // Keep moving downhill even near the lower bound.
      slope = 0.04 + Math.random() * 0.05;
    }

    const projectedEndY = prev.yEnd + slope * length;
    if (projectedEndY > TERRAIN_MAX_Y) {
      slope = Math.max(0.03, (TERRAIN_MAX_Y - prev.yEnd) / length);
    }
    if (projectedEndY < TERRAIN_MIN_Y) {
      slope = Math.max(0.03, (TERRAIN_MIN_Y - prev.yEnd) / length);
    }

    const next = createTerrainSegment(prev.end, prev.yEnd, length, slope);
    state.terrainSegments.push(next);
  }
}

function getTerrainSegment(worldX) {
  fillTerrainTo(worldX + 1200);

  for (let i = state.terrainSegments.length - 1; i >= 0; i -= 1) {
    const seg = state.terrainSegments[i];
    if (worldX >= seg.start) {
      return seg;
    }
  }

  return state.terrainSegments[0];
}

function terrainYAtWorldX(worldX) {
  const seg = getTerrainSegment(worldX);
  return seg.yStart + seg.slope * (worldX - seg.start);
}

function terrainSlopeAtWorldX(worldX) {
  return getTerrainSegment(worldX).slope;
}

function groundAtX(screenX) {
  return clamp(terrainYAtWorldX(state.worldOffset + screenX), TERRAIN_MIN_Y, TERRAIN_MAX_Y);
}

function slopeAtX(screenX) {
  return terrainSlopeAtWorldX(state.worldOffset + screenX);
}

function slopeAngleAtX(screenX) {
  return Math.atan(slopeAtX(screenX));
}

function getShipY() {
  return groundAtX(SHIP_X + SHIP_W * 0.82) - 176;
}

function showStartScreen() {
  startScreenEl.classList.remove("hidden");
}

function hideStartScreen() {
  startScreenEl.classList.add("hidden");
}

function loadBestScore() {
  const raw = localStorage.getItem(BEST_SCORE_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function saveBestScore(value) {
  localStorage.setItem(BEST_SCORE_KEY, String(Math.floor(value)));
}

function beginIntro() {
  state.introActive = true;
  state.running = false;
  state.score = 0;
  state.obstacles = [];
  state.player.vy = 0;
  state.worldOffset = 0;

  initializeTerrain();

  const shipY = getShipY();
  state.player.x = SHIP_X + SHIP_W * 0.42;
  state.player.y = shipY + SHIP_H * 0.08;
  state.introStartAt = performance.now();
  syncHud();
}

function beginGame() {
  state.sessionStarted = true;
  hideStartScreen();
  beginIntro();
}

function resetGame(rebuildTerrain = true) {
  if (rebuildTerrain) {
    state.worldOffset = 0;
    initializeTerrain();
  }

  state.player.x = 90;
  state.player.vy = 0;
  state.player.y = groundAtX(state.player.x + state.player.w * 0.5) - state.player.h;
  state.obstacles = [];
  state.score = 0;
  state.running = true;
  state.introActive = false;

  const now = performance.now();
  state.lastSpawnAt = now;
  state.startedAt = now;
  state.speed = 7.2;

  syncHud();
}

function syncHud() {
  scoreEl.textContent = String(Math.floor(state.score));
  bestEl.textContent = String(Math.floor(state.best));
}

function spawnObstacle(now) {
  const isBig = Math.random() < 0.24;
  const height = isBig ? 52 + Math.random() * 34 : 26 + Math.random() * 40;
  const width = isBig ? 50 + Math.random() * 42 : 18 + Math.random() * 28;
  const x = canvas.width + 10;
  const y = groundAtX(x + width * 0.5) - height;

  state.obstacles.push({
    x,
    y,
    w: width,
    h: height,
    flying: false,
    big: isBig,
  });

  state.lastSpawnAt = now;
}

function spawnPlatform(now) {
  const width = 74 + Math.random() * 130;
  const height = 14 + Math.random() * 20;
  const x = canvas.width + 10;
  const y = groundAtX(x + width * 0.5) - height;
  const styleType = Math.floor(Math.random() * 4);
  const hazard = Math.random() < 0.65;
  const rust = Math.random() < 0.55;
  const broken = Math.random() < 0.25;

  state.obstacles.push({
    x,
    y,
    w: width,
    h: height,
    flying: false,
    platform: true,
    styleType,
    hazard,
    rust,
    broken,
  });

  state.lastSpawnAt = now;
}

function spawnFlyer(now) {
  const width = 24 + Math.random() * 16;
  const height = 14 + Math.random() * 8;
  const variant = Math.random() < 0.5 ? "green" : "black";
  const x = canvas.width + 10;

  const minY = 84;
  const maxY = groundAtX(x + width * 0.5) - height - 12;

  state.obstacles.push({
    x,
    y: minY + Math.random() * Math.max(10, maxY - minY),
    w: width,
    h: height,
    flying: true,
    variant,
  });

  state.lastSpawnAt = now;
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function getPlayerHitbox() {
  return {
    x: state.player.x + 8,
    y: state.player.y + 4,
    w: state.player.w - 14,
    h: state.player.h - 8,
  };
}

function getObstacleHitbox(obstacle) {
  if (obstacle.flying) {
    return obstacle;
  }

  if (obstacle.platform) {
    return {
      x: obstacle.x + obstacle.w * 0.04,
      y: obstacle.y,
      w: obstacle.w * 0.92,
      h: obstacle.h,
    };
  }

  return {
    x: obstacle.x + obstacle.w * 0.12,
    y: obstacle.y + obstacle.h * 0.16,
    w: obstacle.w * 0.76,
    h: obstacle.h * 0.84,
  };
}

function overlapsX(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x;
}

function jump() {
  if (!state.sessionStarted || !state.running || state.introActive) {
    return;
  }

  const playerGround = groundAtX(state.player.x + state.player.w * 0.5);
  const onGround = state.player.y + state.player.h >= playerGround - 1;
  if (onGround) {
    state.player.vy = -state.player.jumpForce;
  }
}

function updateIntro(now) {
  const elapsed = now - state.introStartAt;

  const shipY = getShipY();
  const beamX = SHIP_X + SHIP_W * 0.52;
  const startX = beamX - state.player.w * 0.5;
  const startY = shipY + SHIP_H * 0.7;
  const landingY = groundAtX(startX + state.player.w * 0.5) - state.player.h;
  const endX = 90;
  const endY = groundAtX(endX + state.player.w * 0.5) - state.player.h;

  if (elapsed < INTRO_SHIP_HOLD_MS) {
    state.player.x = startX;
    state.player.y = startY;
    return;
  }

  const p = clamp((elapsed - INTRO_SHIP_HOLD_MS) / INTRO_DROP_MS, 0, 1);

  if (p < 0.76) {
    const q = p / 0.76;
    const fallEase = 1 - Math.pow(1 - q, 3);
    state.player.x = startX;
    state.player.y = lerp(startY, landingY, fallEase);
  } else {
    const q = (p - 0.76) / 0.24;
    state.player.x = lerp(startX, endX, q);
    state.player.y = lerp(landingY, endY, q);
  }

  if (p >= 1) {
    resetGame(false);
  }
}

function update(now) {
  if (!state.sessionStarted) {
    return;
  }

  if (state.introActive) {
    updateIntro(now);
    return;
  }

  if (!state.running) {
    return;
  }

  const elapsedSeconds = (now - state.startedAt) / 1000;
  state.speed = 7.2 + elapsedSeconds * 0.12;
  const worldStep = state.speed;
  state.worldOffset += worldStep;

  const gravity = 1.05;
  const previousPlayerBottom = state.player.y + state.player.h;
  state.player.vy += gravity;
  state.player.y += state.player.vy;

  const playerGround = groundAtX(state.player.x + state.player.w * 0.5);
  if (state.player.y + state.player.h >= playerGround) {
    state.player.y = playerGround - state.player.h;
    state.player.vy = 0;
  }

  state.score = elapsedSeconds * 12;
  if (state.score > state.best) {
    state.best = state.score;
    saveBestScore(state.best);
  }

  const spawnDelay = Math.max(520, 980 - elapsedSeconds * 12);
  if (now - state.lastSpawnAt > spawnDelay) {
    if (Math.random() < 0.45) {
      spawnFlyer(now);
    } else if (Math.random() < 0.3) {
      spawnPlatform(now);
    } else {
      spawnObstacle(now);
    }
  }

  for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = state.obstacles[i];
    obstacle.x -= worldStep;

    if (!obstacle.flying) {
      obstacle.y = groundAtX(obstacle.x + obstacle.w * 0.5) - obstacle.h;
    } else {
      const localUfoSlope = slopeAtX(obstacle.x + obstacle.w * 0.5);
      obstacle.y -= localUfoSlope * worldStep;
    }

    const playerHitbox = getPlayerHitbox();
    const obstacleHitbox = getObstacleHitbox(obstacle);

    if ((obstacle.big || obstacle.platform) && !obstacle.flying) {
      const obstacleTop = obstacle.platform ? obstacle.y + 1 : obstacle.y + obstacle.h * 0.14;
      const playerBottom = playerHitbox.y + playerHitbox.h;
      const overlapOnX = overlapsX(playerHitbox, obstacleHitbox);
      const touchingTopBand = playerBottom >= obstacleTop - 2 && playerBottom <= obstacleTop + 14;
      const playerWasAboveTop = previousPlayerBottom <= obstacleTop + (obstacle.platform ? 14 : 6);
      const descending = state.player.vy >= -0.2;
      const canLandFromTop = overlapOnX && touchingTopBand && playerWasAboveTop && descending;

      if (canLandFromTop) {
        state.player.y = obstacleTop - state.player.h;
        state.player.vy = 0;
      } else if (intersects(playerHitbox, obstacleHitbox)) {
        // Big rocks and metal boxes are dangerous from side/bottom.
        state.running = false;
        break;
      }
    } else if (intersects(playerHitbox, obstacleHitbox)) {
      state.running = false;
      break;
    }

    if (obstacle.x + obstacle.w < -2) {
      state.obstacles.splice(i, 1);
    }
  }

  syncHud();
}

function drawShip(now) {
  const shipY = getShipY();

  ctx.save();
  ctx.shadowColor = "rgba(77, 216, 255, 0.6)";
  ctx.shadowBlur = 10;

  ctx.fillStyle = "#8de9ff";
  ctx.beginPath();
  ctx.ellipse(SHIP_X + SHIP_W * 0.5, shipY + SHIP_H * 0.42, SHIP_W * 0.5, SHIP_H * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#bdf7ff";
  ctx.beginPath();
  ctx.ellipse(SHIP_X + SHIP_W * 0.45, shipY + SHIP_H * 0.28, SHIP_W * 0.24, SHIP_H * 0.2, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  if (state.introActive && now - state.introStartAt >= INTRO_SHIP_HOLD_MS) {
    const beamTopX = SHIP_X + SHIP_W * 0.52;
    const beamTopY = shipY + SHIP_H * 0.62;
    const beamBottomY = groundAtX(beamTopX) - 6;
    const beamHalfWidth = 76;

    const beamGradient = ctx.createLinearGradient(beamTopX, beamTopY, beamTopX, beamBottomY);
    beamGradient.addColorStop(0, "rgba(130, 255, 255, 0.78)");
    beamGradient.addColorStop(0.45, "rgba(120, 236, 255, 0.35)");
    beamGradient.addColorStop(1, "rgba(120, 236, 255, 0.02)");

    ctx.fillStyle = beamGradient;
    ctx.beginPath();
    ctx.moveTo(beamTopX - 10, beamTopY);
    ctx.lineTo(beamTopX + 10, beamTopY);
    ctx.lineTo(beamTopX + beamHalfWidth, beamBottomY);
    ctx.lineTo(beamTopX - beamHalfWidth, beamBottomY);
    ctx.closePath();
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawPlayer() {
  const playerDrawW = 44;
  const playerDrawH = 68;
  const playerDrawX = Math.round(state.player.x + (state.player.w - playerDrawW) / 2);
  const playerDrawY = Math.round(state.player.y + state.player.h - playerDrawH + 8);

  if (!playerSpriteReady) {
    ctx.fillStyle = "#4fe3ff";
    ctx.fillRect(state.player.x, state.player.y, state.player.w, state.player.h);
    return;
  }

  const playerGround = groundAtX(state.player.x + state.player.w * 0.5);
  const onGround = state.player.y + state.player.h >= playerGround - 1;

  let angle = 0;
  if (state.introActive || (state.running && onGround)) {
    angle = slopeAngleAtX(state.player.x + state.player.w * 0.5) * 0.65;
  }

  ctx.save();
  ctx.translate(playerDrawX + playerDrawW * 0.5, playerDrawY + playerDrawH * 0.52);
  ctx.rotate(angle);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    playerSpriteCanvas,
    0,
    0,
    PLAYER_IMAGE_W,
    PLAYER_IMAGE_H,
    -playerDrawW * 0.5,
    -playerDrawH * 0.52,
    playerDrawW,
    playerDrawH
  );
  ctx.imageSmoothingEnabled = true;
  ctx.restore();
}

function drawObstacles() {
  for (const obstacle of state.obstacles) {
    if (obstacle.flying) {
      const domeColor = obstacle.variant === "black" ? "#43ff7a" : "#7dff9a";
      const baseColor = obstacle.variant === "black" ? "#0f4b2a" : "#1a7d34";
      const lightColor = obstacle.variant === "black" ? "#a7ffbf" : "#d7ffe2";
      const x = obstacle.x;
      const y = obstacle.y;
      const w = obstacle.w;
      const h = obstacle.h;
      const ufoAngle = slopeAngleAtX(x + w * 0.5);

      ctx.save();
      ctx.translate(x + w * 0.5, y + h * 0.6);
      ctx.rotate(ufoAngle * 0.7);

      ctx.shadowColor = "rgba(90, 255, 145, 0.9)";
      ctx.shadowBlur = obstacle.variant === "black" ? 16 : 12;

      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.ellipse(0, h * 0.1, w * 0.5, h * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = domeColor;
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.15, w * 0.28, h * 0.25, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = lightColor;
      ctx.beginPath();
      ctx.arc(-w * 0.22, h * 0.1, Math.max(1.8, w * 0.05), 0, Math.PI * 2);
      ctx.arc(0, h * 0.12, Math.max(1.8, w * 0.05), 0, Math.PI * 2);
      ctx.arc(w * 0.22, h * 0.1, Math.max(1.8, w * 0.05), 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.restore();
      continue;
    }

    const x = obstacle.x;
    const w = obstacle.w;
    const h = obstacle.h;
    const centerX = x + w * 0.5;
    const baseY = groundAtX(centerX);

    ctx.save();
    ctx.translate(centerX, baseY);
    ctx.rotate(slopeAngleAtX(centerX) * 0.9);

    if (obstacle.platform) {
      const styleType = obstacle.styleType ?? 0;
      const hazard = obstacle.hazard ?? true;
      const rust = obstacle.rust ?? false;
      const broken = obstacle.broken ?? false;
      const palette = [
        ["#4f5e6b", "#8a9aa8", "#3f4d59"],
        ["#5f6a73", "#9daab5", "#47545f"],
        ["#425463", "#7f93a4", "#32424f"],
        ["#5a5f66", "#969da8", "#434950"],
      ][styleType];

      const metalGradient = ctx.createLinearGradient(-w * 0.5, -h, w * 0.5, 0);
      metalGradient.addColorStop(0, palette[0]);
      metalGradient.addColorStop(0.5, palette[1]);
      metalGradient.addColorStop(1, palette[2]);

      if (broken) {
        // Jagged broken plate variant.
        ctx.fillStyle = metalGradient;
        ctx.beginPath();
        ctx.moveTo(-w * 0.5, 0);
        ctx.lineTo(-w * 0.5, -h);
        ctx.lineTo(-w * 0.2, -h * 0.92);
        ctx.lineTo(0, -h * 0.72);
        ctx.lineTo(w * 0.22, -h * 0.98);
        ctx.lineTo(w * 0.5, -h * 0.86);
        ctx.lineTo(w * 0.5, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = metalGradient;
        ctx.fillRect(-w * 0.5, -h, w, h);
      }

      ctx.strokeStyle = "#2f3943";
      ctx.lineWidth = 2;
      if (broken) {
        ctx.beginPath();
        ctx.moveTo(-w * 0.5, 0);
        ctx.lineTo(-w * 0.5, -h);
        ctx.lineTo(-w * 0.2, -h * 0.92);
        ctx.lineTo(0, -h * 0.72);
        ctx.lineTo(w * 0.22, -h * 0.98);
        ctx.lineTo(w * 0.5, -h * 0.86);
        ctx.lineTo(w * 0.5, 0);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.strokeRect(-w * 0.5, -h, w, h);
      }

      // Top highlight panel
      ctx.fillStyle = "rgba(202, 223, 240, 0.36)";
      if (broken) {
        ctx.beginPath();
        ctx.moveTo(-w * 0.44, -h * 0.82);
        ctx.lineTo(-w * 0.16, -h * 0.8);
        ctx.lineTo(w * 0.02, -h * 0.67);
        ctx.lineTo(w * 0.22, -h * 0.86);
        ctx.lineTo(w * 0.44, -h * 0.78);
        ctx.lineTo(w * 0.44, -h * 0.66);
        ctx.lineTo(-w * 0.44, -h * 0.66);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-w * 0.46, -h * 0.86, w * 0.92, h * 0.22);
      }

      if (rust) {
        // Rust/dirt scratches for "space junk" feel
        ctx.strokeStyle = "rgba(126, 89, 52, 0.65)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-w * 0.32, -h * 0.56);
        ctx.lineTo(-w * 0.08, -h * 0.56);
        ctx.moveTo(w * 0.06, -h * 0.42);
        ctx.lineTo(w * 0.3, -h * 0.42);
        ctx.stroke();
      }

      if (broken) {
        // Stress cracks
        ctx.strokeStyle = "rgba(28, 33, 39, 0.8)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-w * 0.06, -h * 0.66);
        ctx.lineTo(w * 0.08, -h * 0.52);
        ctx.lineTo(w * 0.2, -h * 0.62);
        ctx.moveTo(-w * 0.24, -h * 0.62);
        ctx.lineTo(-w * 0.16, -h * 0.5);
        ctx.stroke();
      }

      if (hazard) {
        // Hazard strip
        ctx.fillStyle = "#d5a938";
        ctx.fillRect(-w * 0.5, -h * 0.18, w, h * 0.1);
        ctx.strokeStyle = "#2b2b2b";
        ctx.lineWidth = 1;
        for (let sx = -w * 0.5; sx < w * 0.5; sx += 9) {
          ctx.beginPath();
          ctx.moveTo(sx, -h * 0.08);
          ctx.lineTo(sx + 6, -h * 0.18);
          ctx.stroke();
        }
      }

      // Rivets/panel screws
      ctx.fillStyle = "#c2cbd3";
      ctx.beginPath();
      ctx.arc(-w * 0.38, -h * 0.5, 1.6, 0, Math.PI * 2);
      ctx.arc(-w * 0.12, -h * 0.5, 1.6, 0, Math.PI * 2);
      ctx.arc(w * 0.14, -h * 0.5, 1.6, 0, Math.PI * 2);
      ctx.arc(w * 0.38, -h * 0.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (obstacle.big) {
      // Large rock with a flatter top so player can land and slide over it.
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, 0);
      ctx.lineTo(-w * 0.44, -h * 0.52);
      ctx.lineTo(-w * 0.2, -h * 0.8);
      ctx.lineTo(w * 0.2, -h * 0.82);
      ctx.lineTo(w * 0.44, -h * 0.55);
      ctx.lineTo(w * 0.5, 0);
      ctx.closePath();
    } else {
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, 0);
      ctx.lineTo(-w * 0.42, -h * 0.46);
      ctx.lineTo(-w * 0.23, -h * 0.8);
      ctx.lineTo(0, -h * 0.95);
      ctx.lineTo(w * 0.28, -h * 0.74);
      ctx.lineTo(w * 0.44, -h * 0.38);
      ctx.lineTo(w * 0.5, 0);
      ctx.closePath();
    }

    ctx.fillStyle = "#a4acba";
    ctx.fill();
    ctx.strokeStyle = "#6f7685";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#8f97a7";
    ctx.beginPath();
    ctx.arc(-w * 0.16, -h * 0.38, Math.max(2.4, w * 0.08), 0, Math.PI * 2);
    ctx.arc(w * 0.18, -h * 0.5, Math.max(1.9, w * 0.06), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawGround() {
  ctx.fillStyle = "#29434f";
  ctx.beginPath();
  ctx.moveTo(0, groundAtX(0));
  for (let x = TERRAIN_SAMPLE_STEP; x <= canvas.width; x += TERRAIN_SAMPLE_STEP) {
    ctx.lineTo(x, groundAtX(x));
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#5ecb89";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, groundAtX(0) + 1.5);
  for (let x = TERRAIN_SAMPLE_STEP; x <= canvas.width; x += TERRAIN_SAMPLE_STEP) {
    ctx.lineTo(x, groundAtX(x) + 1.5);
  }
  ctx.stroke();
}

function draw(now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#02263d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGround();

  if (state.introActive) {
    drawShip(now);
  }

  const introPlayerVisible = !state.introActive || (now - state.introStartAt >= INTRO_SHIP_HOLD_MS);
  if (state.sessionStarted && introPlayerVisible) {
    drawPlayer();
  }
  drawObstacles();

  if (state.sessionStarted && !state.running && !state.introActive) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 38px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 8);

    ctx.font = "18px Segoe UI";
    ctx.fillText(`Poeng: ${Math.floor(state.score)}`, canvas.width / 2, canvas.height / 2 + 30);
  }
}

function loop(now) {
  update(now);
  draw(now);
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "r") {
    if (!state.sessionStarted) {
      beginGame();
    } else {
      beginIntro();
    }
    return;
  }

  if (key === " " || key === "arrowup" || key === "w") {
    e.preventDefault();
    jump();
  }
});

canvas.addEventListener("click", () => {
  jump();
});

restartBtn.addEventListener("click", () => {
  if (!state.sessionStarted) {
    beginGame();
  } else {
    beginIntro();
  }
});

startGameBtn.addEventListener("click", () => {
  beginGame();
});

state.best = loadBestScore();
initializeTerrain();
state.player.y = groundAtX(state.player.x + state.player.w * 0.5) - state.player.h;
state.player.vy = 0;
syncHud();
showStartScreen();
requestAnimationFrame(loop);
