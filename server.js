const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Server } = require("socket.io");

const FFMPEG = "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe";

let ffmpegProcess = null;
let clients = [];
let currentSong = 0;

let musicEnabled = true;
let micEnabled = true;
let isRestarting = false;
let streamId = 0; // 🆕 ID único para cada stream

// 🎶 PLAYLIST
const playlist = fs
  .readFileSync(path.join(__dirname, "music/playlist.txt"), "utf8")
  .split("\n")
  .map(l => l.trim())
  .filter(l => l.startsWith("file"))
  .map(l => l.replace("file ", "").replace(/'/g, ""));

// =======================
// 🛑 MATAR FFMPEG
// =======================
function killFFmpeg() {
  if (ffmpegProcess) {
    try {
      ffmpegProcess.kill("SIGKILL");
    } catch (e) {}
    ffmpegProcess = null;
  }
}

// =======================
// 🎧 FFMPEG STREAM
// =======================
function startFFmpeg() {
  if (isRestarting) return;

  if (ffmpegProcess) {
    isRestarting = true;

    // 🆕 Notificar a todos los clientes que el stream cambió
    streamId++;
    clients.forEach(res => res.end());
    clients = [];

    killFFmpeg();

    setTimeout(() => {
      isRestarting = false;
      startFFmpeg();
    }, 300);
    return;
  }

  if (!musicEnabled && !micEnabled) return;

  const song = playlist[currentSong];
  console.log(`🎶 ${song} (Stream ID: ${streamId})`);

  let args = [];
  let filters = [];
  let mix = [];
  let i = 0;

  if (micEnabled) {
    // Cambiar "Micrófono (Realtek(R) Audio)" por el nombre real de tu micrófono
    // Para encontrarlo, ejecuta: ffmpeg -list_devices true -f dshow -i dummy
    args.push("-f", "dshow", "-i", "audio=Micrófono");
    filters.push(`[${i}:a]volume=3.0[a${i}]`);
    mix.push(`[a${i}]`);
    i++;
  }

  if (musicEnabled) {
    const musicPath = path.join(__dirname, "music", song);
    console.log(`📁 Ruta del archivo: ${musicPath}`);
    args.push("-stream_loop", "-1", "-i", musicPath);
    filters.push(`[${i}:a]volume=0.6[a${i}]`);
    mix.push(`[a${i}]`);
    i++;
  }

  const filterComplex =
    filters.join(";") + ";" + `${mix.join("")}amix=inputs=${mix.length}`;

  ffmpegProcess = spawn(
    FFMPEG,
    [
      ...args,
      "-filter_complex", filterComplex,
      "-ac", "2",
      "-ar", "48000",
      "-c:a", "libopus",
      "-b:a", "96k",
      "-vbr", "on",
      "-application", "lowdelay",
      "-frame_duration", "20",
      "-f", "ogg",
      "pipe:1"
    ],
    { stdio: ["ignore", "pipe", "ignore"] }
  );

  ffmpegProcess.stdout.on("data", chunk => {
    clients.forEach(res => {
      if (!res.destroyed && !res.writableEnded) {
        if (!res.headersSent) res.flushHeaders();
        res.write(chunk);
      }
    });
  });

  ffmpegProcess.on("exit", () => {
    ffmpegProcess = null;
  });
}

// =======================
// 🌐 HTTP
// =======================
const server = http.createServer((req, res) => {

  if (req.url.startsWith("/stream")) {
    const currentStreamId = streamId; // 🆕 Capturar el ID del stream actual
    
    res.writeHead(200, {
      "Content-Type": "audio/ogg;codecs=opus",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Connection": "keep-alive",
      "Transfer-Encoding": "chunked",
      "Accept-Ranges": "none",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });

    clients.push(res);
    console.log(`👂 Oyente conectado. Total: ${clients.length}`);

    if (!ffmpegProcess && !isRestarting) startFFmpeg();

    req.on("close", () => {
      clients = clients.filter(c => c !== res);
      console.log(`👂 Oyente desconectado. Total: ${clients.length}`);
      if (clients.length === 0) killFFmpeg();
    });

    // 🆕 Si el stream cambió mientras el cliente se conectaba
    const checkInterval = setInterval(() => {
      if (streamId !== currentStreamId) {
        clearInterval(checkInterval);
        res.end();
        clients = clients.filter(c => c !== res);
      }
    }, 100);

    return;
  }

  const filePath = path.join(__dirname, "public", req.url === "/" ? "index.html" : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end();
    } else {
      res.writeHead(200); res.end(data);
    }
  });
});

// =======================
// 🔌 SOCKET.IO DJ
// =======================
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", socket => {
  socket.emit("song", playlist[currentSong]);
  socket.emit("state", { musicEnabled, micEnabled });
  socket.emit("streamId", streamId);

  socket.on("next", () => {
    currentSong = (currentSong + 1) % playlist.length;
    io.emit("song", playlist[currentSong]);
    io.emit("streamChange", streamId + 1); // 🆕 Anticipar el siguiente ID
    startFFmpeg(); // ✅ Ahora emitimos ANTES de cambiar
  });

  socket.on("music", v => {
    musicEnabled = v;
    io.emit("state", { musicEnabled, micEnabled });
    io.emit("streamChange", streamId + 1); // 🆕 Anticipar el siguiente ID
    startFFmpeg();
  });

  socket.on("mic", v => {
    micEnabled = v;
    io.emit("state", { musicEnabled, micEnabled });
    io.emit("streamChange", streamId + 1); // 🆕 Anticipar el siguiente ID
    startFFmpeg();
  });
});

server.listen(3000, () => console.log("📻 http://localhost:3000"));