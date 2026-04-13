const express = require("express");
const app = express();

app.use(express.json());

let pixDB = {};

// COLOCA AQUI O TOKEN DO TEU BOT
const TELEGRAM_TOKEN = "8603857963:AAEIYLkuzAI6_UBq_p9t_owSP4j_2Po5E_E";

// página inicial
app.get("/", (req, res) => {
  res.send(`
    <html>
    <head>
      <title>Gerar Pix</title>
      <style>
        body {
          font-family: Arial;
          background: #ffffff;
          color: #111;
          text-align: center;
          padding: 40px;
        }

        .box {
          background: #ffffff;
          padding: 40px;
          border-radius: 16px;
          display: inline-block;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
          border: 1px solid #ddd;
          width: 460px;
          max-width: 90%;
        }

        textarea {
          width: 100%;
          height: 140px;
          padding: 15px;
          border-radius: 10px;
          border: 1px solid #ccc;
          margin-top: 15px;
          font-size: 14px;
          resize: none;
          box-sizing: border-box;
        }

        input {
          width: 100%;
          padding: 15px;
          border-radius: 10px;
          border: 1px solid #ccc;
          margin-top: 15px;
          font-size: 14px;
          box-sizing: border-box;
        }

        button {
          background: #22c55e;
          border: none;
          padding: 15px;
          font-size: 16px;
          color: white;
          border-radius: 10px;
          cursor: pointer;
          margin-top: 15px;
          width: 100%;
        }

        button:hover {
          opacity: 0.95;
        }

        .link-box {
          margin-top: 20px;
          display: none;
        }

        .copy-btn {
          background: #2563eb;
        }

        .ok {
          margin-top: 10px;
          color: #16a34a;
          display: none;
        }
      </style>
    </head>

    <body>
      <div class="box">
        <h2>💸 Gerador de Link Pix</h2>

        <textarea id="pix" placeholder="Cole o código Pix aqui"></textarea>

        <input id="pedido" placeholder="Número do pedido" />

        <button onclick="gerar()">Gerar Link</button>

        <div class="link-box" id="linkBox">
          <input id="link" readonly />
          <button class="copy-btn" onclick="copiarLink()">📋 Copiar Link</button>
          <div class="ok" id="okLink">✔ Link copiado com sucesso</div>
        </div>
      </div>

      <script>
        async function gerar() {
          const pix = document.getElementById("pix").value.trim();
          const pedido = document.getElementById("pedido").value.trim();

          if (!pix) {
            alert("Cole o código Pix primeiro.");
            return;
          }

          const res = await fetch("/create", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ pix, pedido })
          });

          const data = await res.json();

          document.getElementById("linkBox").style.display = "block";
          document.getElementById("link").value = data.link;
          document.getElementById("okLink").style.display = "none";
        }

        function copiarLink() {
          const link = document.getElementById("link").value;
          navigator.clipboard.writeText(link);
          document.getElementById("okLink").style.display = "block";
        }
      </script>
    </body>
    </html>
  `);
});

// criar link
app.post("/create", (req, res) => {
  const { pix, pedido } = req.body;

  if (!pix || !pix.trim()) {
    return res.status(400).json({ error: "Pix vazio" });
  }

  const code = Math.random().toString(36).substring(2, 8);

  pixDB[code] = {
    pix: pix.trim(),
    pedido: (pedido || "").trim()
  };

  const baseUrl = req.protocol + "://" + req.get("host");

  res.json({
    link: baseUrl + "/p/" + code
  });
});

// página do Pix
app.get("/p/:code", (req, res) => {
  const data = pixDB[req.params.code];

  if (!data) {
    return res.send(`
      <html>
      <head>
        <title>Link inválido</title>
        <style>
          body {
            font-family: Arial;
            background: #ffffff;
            color: #111;
            text-align: center;
            padding: 40px;
          }

          .box {
            background: #ffffff;
            padding: 40px;
            border-radius: 16px;
            display: inline-block;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
            border: 1px solid #ddd;
            max-width: 420px;
          }
        </style>
      </head>
      <body>
        <div class="box">
          <h2>Link inválido</h2>
          <p>Esse link expirou ou não existe mais.</p>
        </div>
      </body>
      </html>
    `);
  }

  res.send(`
    <html>
    <head>
      <title>Pagamento Pix</title>
      <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>

      <style>
        body {
          font-family: Arial;
          background: #ffffff;
          color: #111;
          text-align: center;
          padding: 40px;
        }

        .box {
          background: #ffffff;
          padding: 40px;
          border-radius: 16px;
          display: inline-block;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
          border: 1px solid #ddd;
          max-width: 420px;
        }

        h2 {
          margin-bottom: 10px;
        }

        .pedido {
          font-weight: bold;
          margin-bottom: 15px;
        }

        .steps {
          text-align: left;
          margin-top: 20px;
          font-size: 14px;
        }

        .step {
          margin-bottom: 10px;
        }

        canvas {
          margin-top: 20px;
          background: white;
          padding: 10px;
          border-radius: 10px;
        }

        button {
          background: #22c55e;
          border: none;
          padding: 15px;
          font-size: 16px;
          color: white;
          border-radius: 10px;
          cursor: pointer;
          margin-top: 25px;
          width: 100%;
        }

        .ok {
          margin-top: 10px;
          color: #22c55e;
          display: none;
        }
      </style>
    </head>

    <body>
      <div class="box">
        <h2>💸 Pagamento via Pix</h2>

        <div class="pedido">Pedido: ${data.pedido || "-"}</div>

        <div class="steps">
          <div class="step">1️⃣ Clique no botão abaixo para copiar o Pix</div>
          <div class="step">2️⃣ Abra o app do seu banco</div>
          <div class="step">3️⃣ Vá em Pix → Copia e Cola</div>
          <div class="step">4️⃣ Cole o código e confirme o pagamento</div>
        </div>

        <canvas id="qrcode"></canvas>

        <button onclick="copiar()">📋 Copiar código Pix</button>
        <div class="ok" id="ok">✔ Copiado com sucesso</div>
      </div>

      <script>
        const pix = ${JSON.stringify(data.pix)};

        QRCode.toCanvas(document.getElementById("qrcode"), pix);

        function copiar() {
          navigator.clipboard.writeText(pix);
          document.getElementById("ok").style.display = "block";
        }
      </script>
    </body>
    </html>
  `);
});

// webhook do Telegram
app.post("/telegram", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.text) {
      return res.sendStatus(200);
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    console.log("Mensagem recebida no Telegram:", text);

    let resposta = "Não entendi. Envie algo como: pagar 50";

    if (text.toLowerCase().startsWith("pagar ")) {
      const valor = text.split(" ")[1];

      if (valor && !isNaN(valor)) {
        resposta = "Recebi seu pedido de pagamento de R$ " + valor + ". Aguarde...";
      }
    }

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: resposta
      })
    });

    res.sendStatus(200);
  } catch (error) {
    console.error("Erro no Telegram:", error);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Rodando na porta " + PORT);
});