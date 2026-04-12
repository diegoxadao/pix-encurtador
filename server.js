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
        }

        input {
          width: 80%;
          padding: 15px;
          border-radius: 10px;
          border: 1px solid #ccc;
          margin-top: 15px;
          font-size: 14px;
        }

        button {
          background: #22c55e;
          border: none;
          padding: 15px 25px;
          font-size: 16px;
          color: white;
          border-radius: 10px;
          cursor: pointer;
          margin-top: 20px;
        }

        .link {
          margin-top: 20px;
          font-size: 16px;
        }

        a {
          color: #2563eb;
          text-decoration: none;
        }
      </style>
    </head>

    <body>
      <div class="box">
        <h2>💸 Gerador de Link Pix</h2>

        <input id="pix" placeholder="Cole o código Pix aqui" />
        <br>
        <input id="pedido" placeholder="Número do pedido" />

        <br>
        <button onclick="gerar()">Gerar Link</button>

        <div class="link" id="link"></div>
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

          document.getElementById("link").innerHTML =
            '<a href="' + data.link + '" target="_blank">' + data.link + '</a>';
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