const express = require("express");
const app = express();

app.use(express.json());

let pixDB = {};

// MANTENHA AQUI O MESMO TOKEN DO TELEGRAM QUE ESTAVA NO ARQUIVO ANTERIOR
const TELEGRAM_TOKEN = "COLE_AQUI_O_MESMO_TOKEN_DO_ARQUIVO_ANTERIOR";


// ======================================================
// FUNÇÕES PARA LER O PIX DINÂMICO
// ======================================================

function lerCamposEMV(texto) {
  const campos = {};
  let pos = 0;

  while (pos + 4 <= texto.length) {
    const id = texto.substring(pos, pos + 2);
    const tamanhoTexto = texto.substring(pos + 2, pos + 4);
    const tamanho = parseInt(tamanhoTexto, 10);

    if (isNaN(tamanho)) {
      break;
    }

    const inicio = pos + 4;
    const fim = inicio + tamanho;

    if (fim > texto.length) {
      break;
    }

    campos[id] = texto.substring(inicio, fim);
    pos = fim;
  }

  return campos;
}


function extrairUrlPix(pix) {
  try {
    const camposPrincipais = lerCamposEMV(pix);

    // No Pix dinâmico, normalmente os dados ficam
    // em um campo Merchant Account Information (26 a 51)
    for (let numero = 26; numero <= 51; numero++) {
      const id = String(numero).padStart(2, "0");
      const campo = camposPrincipais[id];

      if (!campo) {
        continue;
      }

      const subcampos = lerCamposEMV(campo);

      // GUI oficial do Pix
      if (
        subcampos["00"] &&
        subcampos["00"].toLowerCase() === "br.gov.bcb.pix" &&
        subcampos["25"]
      ) {
        let url = subcampos["25"].trim();

        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = "https://" + url;
        }

        return url;
      }
    }

    return null;
  } catch (erro) {
    console.log("Erro ao extrair URL do Pix:", erro);
    return null;
  }
}


async function consultarValidadePix(pix) {
  try {
    const url = extrairUrlPix(pix);

    if (!url) {
      return {
        encontrado: false,
        mensagem: "Não foi possível identificar a validade deste Pix."
      };
    }

    console.log("URL dinâmica encontrada:", url);

    const resposta = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!resposta.ok) {
      return {
        encontrado: false,
        mensagem: "Pix dinâmico identificado, mas não consegui consultar a validade."
      };
    }

    const dados = await resposta.json();

    if (
      !dados.calendario ||
      !dados.calendario.criacao ||
      dados.calendario.expiracao === undefined
    ) {
      return {
        encontrado: false,
        mensagem: "A cobrança não informou o tempo de validade."
      };
    }

    const criacao = new Date(dados.calendario.criacao);
    const expiracaoSegundos = Number(dados.calendario.expiracao);

    if (
      isNaN(criacao.getTime()) ||
      isNaN(expiracaoSegundos)
    ) {
      return {
        encontrado: false,
        mensagem: "Não consegui interpretar a validade deste Pix."
      };
    }

    const expiraEm = new Date(
      criacao.getTime() + expiracaoSegundos * 1000
    );

    const agora = new Date();

    const restanteSegundos = Math.max(
      0,
      Math.floor((expiraEm.getTime() - agora.getTime()) / 1000)
    );

    return {
      encontrado: true,
      expiracaoSegundos,
      criacao: criacao.toISOString(),
      expiraEm: expiraEm.toISOString(),
      restanteSegundos,
      expirado: restanteSegundos <= 0,
      status: dados.status || null
    };

  } catch (erro) {
    console.log("Erro ao consultar validade:", erro);

    return {
      encontrado: false,
      mensagem: "Não foi possível consultar a validade deste Pix."
    };
  }
}


// ======================================================
// PÁGINA INICIAL
// ======================================================

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

        .validade {
          display: none;
          margin-top: 20px;
          padding: 15px;
          border-radius: 10px;
          background: #f3f4f6;
          border: 1px solid #ddd;
          text-align: left;
          line-height: 1.7;
        }

        .validade-titulo {
          font-weight: bold;
          font-size: 16px;
          margin-bottom: 5px;
        }

      </style>
    </head>

    <body>

      <div class="box">

        <h2>💸 Gerador de Link Pix</h2>

        <textarea
          id="pix"
          placeholder="Cole o código Pix aqui"
        ></textarea>

        <input
          id="pedido"
          placeholder="Número do pedido"
        />

        <button onclick="gerar()">
          Gerar Link
        </button>


        <div class="validade" id="validadeBox">

          <div class="validade-titulo">
            ⏱️ Validade do Pix
          </div>

          <div id="validadeTexto"></div>

        </div>


        <div class="link-box" id="linkBox">

          <input id="link" readonly />

          <button
            class="copy-btn"
            onclick="copiarLink()"
          >
            📋 Copiar Link
          </button>

          <div class="ok" id="okLink">
            ✔ Link copiado com sucesso
          </div>

        </div>

      </div>


      <script>

        function formatarDuracao(segundos) {

          segundos = Math.max(0, segundos);

          const minutos = Math.floor(segundos / 60);
          const segundosRestantes = segundos % 60;

          if (minutos > 0) {
            return minutos + " min " + segundosRestantes + " s";
          }

          return segundosRestantes + " s";
        }


        function formatarHora(dataISO) {

          const data = new Date(dataISO);

          return data.toLocaleTimeString(
            "pt-BR",
            {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              timeZone: "America/Sao_Paulo"
            }
          );
        }


        async function gerar() {

          const pix =
            document.getElementById("pix").value.trim();

          const pedido =
            document.getElementById("pedido").value.trim();


          if (!pix) {

            alert("Cole o código Pix primeiro.");

            return;
          }


          const botao = event.target;

          botao.disabled = true;
          botao.innerText = "Gerando...";


          try {

            const res = await fetch("/create", {

              method: "POST",

              headers: {
                "Content-Type": "application/json"
              },

              body: JSON.stringify({
                pix,
                pedido
              })

            });


            const data = await res.json();


            document.getElementById("linkBox").style.display =
              "block";

            document.getElementById("link").value =
              data.link;

            document.getElementById("okLink").style.display =
              "none";


            const validadeBox =
              document.getElementById("validadeBox");

            const validadeTexto =
              document.getElementById("validadeTexto");


            validadeBox.style.display = "block";


            if (
              data.validade &&
              data.validade.encontrado
            ) {

              if (data.validade.expirado) {

                validadeTexto.innerHTML =
                  "🔴 <b>Este Pix já expirou.</b>";

              } else {

                const validadeTotal =
                  formatarDuracao(
                    data.validade.expiracaoSegundos
                  );

                const tempoRestante =
                  formatarDuracao(
                    data.validade.restanteSegundos
                  );

                const horaExpiracao =
                  formatarHora(
                    data.validade.expiraEm
                  );


                validadeTexto.innerHTML =

                  "Validade total: <b>" +
                  validadeTotal +
                  "</b><br>" +

                  "Tempo restante: <b>" +
                  tempoRestante +
                  "</b><br>" +

                  "Expira às: <b>" +
                  horaExpiracao +
                  "</b>";

              }

            } else {

              validadeTexto.innerHTML =
                "⚠️ " +
                (
                  data.validade?.mensagem ||
                  "Não foi possível descobrir a validade."
                );

            }

          } catch (erro) {

            alert(
              "Ocorreu um erro ao gerar o link."
            );

          } finally {

            botao.disabled = false;

            botao.innerText =
              "Gerar Link";

          }

        }


        function copiarLink() {

          const link =
            document.getElementById("link").value;

          navigator.clipboard.writeText(link);

          document.getElementById("okLink").style.display =
            "block";

        }

      </script>

    </body>
    </html>
  `);
});


// ======================================================
// CRIAR LINK
// ======================================================

app.post("/create", async (req, res) => {

  const { pix, pedido } = req.body;


  if (!pix || !pix.trim()) {

    return res.status(400).json({
      error: "Pix vazio"
    });

  }


  const pixLimpo = pix.trim();

  const code =
    Math.random()
      .toString(36)
      .substring(2, 8);


  pixDB[code] = {

    pix: pixLimpo,

    pedido:
      (pedido || "").trim()

  };


  const baseUrl =
    req.protocol +
    "://" +
    req.get("host");


  // Consulta a validade do Pix
  const validade =
    await consultarValidadePix(pixLimpo);


  res.json({

    link:
      baseUrl +
      "/p/" +
      code,

    validade

  });

});


// ======================================================
// PÁGINA DO CLIENTE
// ======================================================

app.get("/p/:code", (req, res) => {

  const data =
    pixDB[req.params.code];


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

          <p>
            Esse link expirou ou não existe mais.
          </p>

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

        <div class="pedido">
          Pedido: ${data.pedido || "-"}
        </div>


        <div class="steps">

          <div class="step">
            1️⃣ Clique no botão abaixo para copiar o Pix
          </div>

          <div class="step">
            2️⃣ Abra o app do seu banco
          </div>

          <div class="step">
            3️⃣ Vá em Pix → Copia e Cola
          </div>

          <div class="step">
            4️⃣ Cole o código e confirme o pagamento
          </div>

        </div>


        <canvas id="qrcode"></canvas>


        <button onclick="copiar()">
          📋 Copiar código Pix
        </button>


        <div class="ok" id="ok">
          ✔ Copiado com sucesso
        </div>

      </div>


      <script>

        const pix =
          ${JSON.stringify(data.pix)};


        QRCode.toCanvas(
          document.getElementById("qrcode"),
          pix
        );


        function copiar() {

          navigator.clipboard.writeText(pix);

          document.getElementById("ok").style.display =
            "block";

        }

      </script>

    </body>

    </html>

  `);

});


// ======================================================
// TELEGRAM
// ======================================================

app.post("/telegram", async (req, res) => {

  try {

    const message =
      req.body.message;


    if (
      !message ||
      !message.text
    ) {

      return res.sendStatus(200);

    }


    const chatId =
      message.chat.id;

    const text =
      message.text.trim();


    console.log(
      "Mensagem recebida no Telegram:",
      text
    );


    let resposta =
      "Não entendi. Envie algo como: pagar 50";


    if (
      text.toLowerCase().startsWith("pagar ")
    ) {

      const valor =
        text.split(" ")[1];


      if (
        valor &&
        !isNaN(valor)
      ) {

        resposta =
          "Recebi seu pedido de pagamento de R$ " +
          valor +
          ". Aguarde...";

      }

    }


    if (
      TELEGRAM_TOKEN &&
      !TELEGRAM_TOKEN.startsWith("COLE_AQUI")
    ) {

      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {

          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({

            chat_id: chatId,

            text: resposta

          })

        }
      );

    }


    res.sendStatus(200);


  } catch (error) {

    console.error(
      "Erro no Telegram:",
      error
    );

    res.sendStatus(500);

  }

});


// ======================================================
// SERVIDOR
// ======================================================

const PORT =
  process.env.PORT || 3000;


app.listen(PORT, () => {

  console.log(
    "Rodando na porta " +
    PORT
  );

});