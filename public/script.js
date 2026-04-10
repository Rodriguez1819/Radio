const radio = document.getElementById("radio");

function connectRadio() {
  // romper caché para forzar nuevo stream
  radio.src = "/stream?ts=" + Date.now();
  radio.load();
  radio.play().catch(() => {});
}

// ▶️ iniciar radio
connectRadio();

// 🔴 estado
radio.addEventListener("play", () => {
  console.log("🔴 Radio en vivo");
});

radio.addEventListener("pause", () => {
  console.log("⏸️ Radio pausada por el usuario");
});

// 🔌 si el stream se congela o se corta
radio.addEventListener("stalled", () => {
  console.log("⚠️ Stream detenido, reconectando...");
  connectRadio();
});

radio.addEventListener("ended", () => {
  console.log("🔁 Stream finalizado, reconectando...");
  connectRadio();
});

radio.addEventListener("error", () => {
  console.log("❌ Error en stream, reconectando...");
  connectRadio();
});
