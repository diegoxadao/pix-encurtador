const express = require("express");
const app = express();

app.use(express.json());

let pixDB = {};

const BASE_URL = "https://pix-encurtador.onrender.com";

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
          width: 400px;
        }

        textarea {
          width: 100%;
          height: 120px;
          padding: 15px;
          border-radius: 10px;
          border: 1px solid #ccc;
          margin-top: 15px;
          font-size: 14px;
          resize: none;
        }

        input {
          width: 100%;
          padding: 15px;
          border-radius: 10px;
          border: 1px solid #ccc;
          margin-top: 15px;
          font-size: 14px;
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

        .link-box {
          margin-top: 20px;
        }

        .copy-btn {
          background: #2563eb;
        }
      </style>
    </head>

    <body>
      <div class="box">
        <h2>💸 Gerador de Link Pix</h2>

        <textarea id="pix" placeholder="Cole o código Pix aqui"></textarea>

        <input id="pedido" placeholder="Número do pedido" />

        <button onclick="gerar()">Gerar Link</button>

        <div class="link-box" id="linkBox" style="display:none;">
          <input id="link" readonly />
          <button class="copy-btn" onclick="copiarLink()">📋 Copiar Link</button>
        </div>
      </div>

      <script>
        async function gerar() {
          const pix = document.getElementById("pix").value;
          const pedido = document.getElementById("pedido").value;

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
        }

        function copiarLink() {
          const link = document.getElementById("link").value;
          navigator.clipboard.writeText(link);
          alert("Link copiado!");
        }
      </script>
    </body>
    </html>
  `);
});

// criar link
app.post("/create", (req, res) => {
  const { pix, pedido } = req.body;

  const code = Math.random().toString(36).substring(2, 8);

  pixDB[code] = { pix, pedido };

  res.json({
    link: BASE_URL + "/p/" + code
  });
});

// página do Pix
app.get("/p/:code", (req, res) => {
  const data = pixDB[req.params.code];

  if (!data) return res.send("<h2>Link inválido</h2>");

  res.send(`
<html>
<head>
  <title>Pagamento Pix</title>
  <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
</head>
<body>
  <h2>Pagamento via Pix</h2>
  <p>Pedido: ${data.pedido}</p>

  <canvas id="qrcode"></canvas>
  <br><br>

  <button onclick="copiar()">Copiar Pix</button>

  <script>
    const pix = "${data.pix}";
    QRCode.toCanvas(document.getElementById("qrcode"), pix);

    function copiar() {
      navigator.clipboard.writeText(pix);
      alert("Copiado!");
    }
  </script>
</body>
</html>
  `);
});

app.listen(3000, () => {
  console.log("Rodando...");
});