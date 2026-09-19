const express = require("express");
const { randomBytes } = require("crypto");

const app = express();
app.use(express.json());

// Os links ficam em memória.
// Se o Render reiniciar, os links antigos deixam de existir.
const pixDB = {};

// ======================================================
// FUNÇÕES PARA LER O PIX DINÂMICO
// ======================================================

function lerCamposEMV(texto) {
  const campos = {};
  let pos = 0;

  while (pos + 4 <= texto.length) {
    const id = texto.substring(pos, pos + 2);
    const tamanho = parseInt(
      texto.substring(pos + 2, pos + 4),
      10
    );

    if (Number.isNaN(tamanho)) {
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

    // Procura o Merchant Account Information
    // onde fica a URL do Pix dinâmico.
    for (let numero = 26; numero <= 51; numero++) {
      const id = String(numero).padStart(2, "0");
      const campo = camposPrincipais[id];

      if (!campo) {
        continue;
      }

      const subcampos = lerCamposEMV(campo);

      if (
        subcampos["00"] &&
        subcampos["00"].toLowerCase() === "br.gov.bcb.pix" &&
        subcampos["25"]
      ) {
        let url = subcampos["25"].trim();

        if (
          !url.startsWith("http://") &&
          !url.startsWith("https://")
        ) {
          url = "https://" + url;
        }

        return url;
      }
    }

  } catch (erro) {
    console.log(
      "Erro ao extrair URL do Pix:",
      erro
    );
  }

  return null;
}


// ======================================================
// DECODIFICAR JWT
// Usado por provedores como qrcode.mkip.com.br
// ======================================================

function decodificarBase64Url(texto) {
  let base64 = texto
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (base64.length % 4 !== 0) {
    base64 += "=";
  }

  return Buffer
    .from(base64, "base64")
    .toString("utf8");
}


function tentarLerJWT(texto) {
  try {
    const token = texto
      .trim()
      .replace(/^"|"$/g, "");

    const partes = token.split(".");

    if (partes.length !== 3) {
      return null;
    }

    const payload =
      decodificarBase64Url(partes[1]);

    return JSON.parse(payload);

  } catch (erro) {
    return null;
  }
}


// ======================================================
// LOCALIZAR O CALENDÁRIO DA COBRANÇA
// ======================================================

function extrairCalendario(dados) {
  if (
    !dados ||
    typeof dados !== "object"
  ) {
    return null;
  }

  // Formato padrão do Pix.
  // Também é o formato encontrado dentro
  // do JWT retornado pelo MKIP.
  if (
    dados.calendario &&
    typeof dados.calendario === "object"
  ) {
    return {
      calendario: dados.calendario,
      status: dados.status || null
    };
  }

  // Alguns provedores podem colocar
  // a cobrança dentro de outro objeto.
  const possibilidades = [
    "cob",
    "cobranca",
    "data",
    "payload"
  ];

  for (const chave of possibilidades) {
    const interno = dados[chave];

    if (
      interno &&
      interno.calendario
    ) {
      return {
        calendario: interno.calendario,
        status:
          interno.status ||
          dados.status ||
          null
      };
    }
  }

  return null;
}


// ======================================================
// CONSULTAR VALIDADE DO PIX
// ======================================================

async function consultarValidadePix(pix) {
  try {
    const url = extrairUrlPix(pix);

    if (!url) {
      return {
        encontrado: false,
        mensagem:
          "Não foi possível identificar a validade deste Pix."
      };
    }

    console.log(
      "URL dinâmica encontrada:",
      url
    );

    const resposta = await fetch(url, {
      method: "GET",

      headers: {
        Accept:
          "application/json, application/jwt, text/plain, */*"
      }
    });


    if (!resposta.ok) {
      return {
        encontrado: false,
        mensagem:
          "Pix dinâmico identificado, mas não consegui consultar a validade."
      };
    }


    // IMPORTANTE:
    // Primeiro pegamos a resposta como TEXTO.
    // Assim conseguimos aceitar tanto JSON
    // quanto JWT.
    const corpo =
      (await resposta.text()).trim();


    let dados = null;


    // ------------------------------------------
    // TENTATIVA 1: JSON NORMAL
    // ------------------------------------------

    try {
      dados = JSON.parse(corpo);

    } catch (erro) {

      // ----------------------------------------
      // TENTATIVA 2: JWT
      // Exemplo: qrcode.mkip.com.br
      // ----------------------------------------

      dados = tentarLerJWT(corpo);
    }


    const resultado =
      extrairCalendario(dados);


    if (!resultado) {
      return {
        encontrado: false,
        mensagem:
          "A cobrança não informou o tempo de validade em um formato reconhecido."
      };
    }


    const calendario =
      resultado.calendario;


    if (
      !calendario.criacao ||
      calendario.expiracao === undefined
    ) {
      return {
        encontrado: false,
        mensagem:
          "A cobrança não informou o tempo de validade."
      };
    }


    const criacao =
      new Date(calendario.criacao);

    const expiracaoSegundos =
      Number(calendario.expiracao);


    if (
      Number.isNaN(criacao.getTime()) ||
      Number.isNaN(expiracaoSegundos)
    ) {
      return {
        encontrado: false,
        mensagem:
          "Não consegui interpretar a validade deste Pix."
      };
    }


    const expiraEm =
      new Date(
        criacao.getTime() +
        expiracaoSegundos * 1000
      );


    const restanteSegundos =
      Math.max(
        0,

        Math.floor(
          (
            expiraEm.getTime() -
            Date.now()
          ) / 1000
        )
      );


    return {
      encontrado: true,

      expiracaoSegundos,

      criacao:
        criacao.toISOString(),

      expiraEm:
        expiraEm.toISOString(),

      restanteSegundos,

      expirado:
        expiraEm.getTime() <= Date.now(),

      status:
        resultado.status
    };


  } catch (erro) {

    console.log(
      "Erro ao consultar validade:",
      erro
    );

    return {
      encontrado: false,

      mensagem:
        "Não foi possível consultar a validade deste Pix."
    };
  }
}


// ======================================================
// PROTEÇÃO PARA TEXTO EXIBIDO NA PÁGINA
// ======================================================

function escaparHtml(valor) {
  return String(valor ?? "")

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );
}


// ======================================================
// PÁGINA INICIAL
// ======================================================

app.get("/", (req, res) => {

  res.send(`

<!doctype html>

<html lang="pt-BR">

<head>

  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>
    Gerar Pix
  </title>


  <style>

    * {
      box-sizing: border-box;
    }


    body {

      font-family:
        Arial,
        sans-serif;

      background:
        #ffffff;

      color:
        #111;

      text-align:
        center;

      padding:
        40px 16px;

      margin:
        0;
    }


    .box {

      background:
        #ffffff;

      padding:
        40px;

      border-radius:
        16px;

      display:
        inline-block;

      box-shadow:
        0 0 20px rgba(0,0,0,0.1);

      border:
        1px solid #ddd;

      width:
        500px;

      max-width:
        100%;
    }


    textarea,
    input {

      width:
        100%;

      padding:
        15px;

      border-radius:
        10px;

      border:
        1px solid #ccc;

      margin-top:
        15px;

      font-size:
        14px;
    }


    textarea {

      height:
        140px;

      resize:
        none;
    }


    button {

      background:
        #22c55e;

      border:
        none;

      padding:
        15px;

      font-size:
        16px;

      color:
        #ffffff;

      border-radius:
        10px;

      cursor:
        pointer;

      margin-top:
        15px;

      width:
        100%;
    }


    button:hover {

      opacity:
        0.95;
    }


    button:disabled {

      opacity:
        0.65;

      cursor:
        wait;
    }


    .link-box {

      margin-top:
        20px;

      display:
        none;
    }


    .copy-btn {

      background:
        #2563eb;
    }


    .ok {

      margin-top:
        10px;

      color:
        #16a34a;

      display:
        none;
    }


    .validade {

      display:
        none;

      margin-top:
        20px;

      padding:
        15px;

      border-radius:
        10px;

      background:
        #f3f4f6;

      border:
        1px solid #ddd;

      text-align:
        left;

      line-height:
        1.7;
    }


    .validade-titulo {

      font-weight:
        bold;

      font-size:
        16px;

      margin-bottom:
        5px;
    }

  </style>

</head>


<body>


  <div class="box">


    <h2>
      💸 Gerador de Link Pix
    </h2>


    <textarea
      id="pix"
      placeholder="Cole o código Pix aqui"
    ></textarea>


    <input
      id="pedido"
      placeholder="Número do pedido"
    >


    <button
      id="gerarBtn"
      onclick="gerar()"
    >
      Gerar Link
    </button>


    <div
      class="validade"
      id="validadeBox"
    >

      <div class="validade-titulo">
        ⏱️ Validade do Pix
      </div>

      <div id="validadeTexto"></div>

    </div>


    <div
      class="link-box"
      id="linkBox"
    >

      <input
        id="link"
        readonly
      >


      <button
        class="copy-btn"
        onclick="copiarLink()"
      >
        📋 Copiar Link
      </button>


      <div
        class="ok"
        id="okLink"
      >
        ✔ Link copiado com sucesso
      </div>

    </div>


  </div>


  <script>


    function formatarDuracao(segundos) {

      segundos =
        Math.max(
          0,
          Math.floor(
            Number(segundos) || 0
          )
        );


      const dias =
        Math.floor(
          segundos / 86400
        );


      const horas =
        Math.floor(
          (segundos % 86400) /
          3600
        );


      const minutos =
        Math.floor(
          (segundos % 3600) /
          60
        );


      const seg =
        segundos % 60;


      const partes = [];


      if (dias) {

        partes.push(
          dias +
          (
            dias === 1
              ? " dia"
              : " dias"
          )
        );
      }


      if (horas) {

        partes.push(
          horas + " h"
        );
      }


      if (minutos) {

        partes.push(
          minutos + " min"
        );
      }


      if (
        !dias &&
        !horas &&
        seg
      ) {

        partes.push(
          seg + " s"
        );
      }


      return partes.length
        ? partes.join(" ")
        : "0 s";
    }


    function formatarDataHora(dataISO) {

      const data =
        new Date(dataISO);


      return data.toLocaleString(
        "pt-BR",

        {

          day:
            "2-digit",

          month:
            "2-digit",

          year:
            "numeric",

          hour:
            "2-digit",

          minute:
            "2-digit",

          second:
            "2-digit",

          timeZone:
            "America/Sao_Paulo"

        }
      );
    }


    async function gerar() {

      const pix =
        document
          .getElementById("pix")
          .value
          .trim();


      const pedido =
        document
          .getElementById("pedido")
          .value
          .trim();


      const botao =
        document
          .getElementById("gerarBtn");


      if (!pix) {

        alert(
          "Cole o código Pix primeiro."
        );

        return;
      }


      botao.disabled =
        true;


      botao.innerText =
        "Gerando...";


      try {


        const resposta =
          await fetch(
            "/create",

            {

              method:
                "POST",

              headers: {

                "Content-Type":
                  "application/json"

              },

              body:
                JSON.stringify({
                  pix,
                  pedido
                })

            }
          );


        const data =
          await resposta.json();


        if (!resposta.ok) {

          throw new Error(
            data.error ||
            "Erro ao gerar link"
          );
        }


        document
          .getElementById("linkBox")
          .style
          .display =
            "block";


        document
          .getElementById("link")
          .value =
            data.link;


        document
          .getElementById("okLink")
          .style
          .display =
            "none";


        const validadeBox =
          document
            .getElementById(
              "validadeBox"
            );


        const validadeTexto =
          document
            .getElementById(
              "validadeTexto"
            );


        validadeBox.style.display =
          "block";


        if (
          data.validade &&
          data.validade.encontrado
        ) {


          if (
            data.validade.expirado
          ) {


            validadeTexto.innerHTML =

              "🔴 <b>Este Pix já expirou.</b>";


          } else {


            validadeTexto.innerHTML =

              "Validade total: <b>" +

              formatarDuracao(
                data.validade
                  .expiracaoSegundos
              ) +

              "</b><br>" +


              "Tempo restante: <b>" +

              formatarDuracao(
                data.validade
                  .restanteSegundos
              ) +

              "</b><br>" +


              "Expira em: <b>" +

              formatarDataHora(
                data.validade
                  .expiraEm
              ) +

              "</b>";

          }


        } else {


          validadeTexto.textContent =

            "⚠️ " +

            (
              data.validade &&
              data.validade.mensagem

                ? data.validade.mensagem

                : "Não foi possível descobrir a validade."
            );

        }


      } catch (erro) {


        alert(
          "Ocorreu um erro ao gerar o link."
        );


        console.error(
          erro
        );


      } finally {


        botao.disabled =
          false;


        botao.innerText =
          "Gerar Link";

      }
    }


    async function copiarLink() {

      const link =
        document
          .getElementById("link")
          .value;


      await navigator
        .clipboard
        .writeText(link);


      document
        .getElementById("okLink")
        .style
        .display =
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

app.post(
  "/create",

  async (req, res) => {

    const {
      pix,
      pedido
    } =
      req.body || {};


    if (
      !pix ||
      !String(pix).trim()
    ) {

      return res
        .status(400)
        .json({

          error:
            "Pix vazio"

        });
    }


    const pixLimpo =
      String(pix).trim();


    const code =
      randomBytes(4)
        .toString("hex")
        .slice(0, 6);


    pixDB[code] = {

      pix:
        pixLimpo,

      pedido:
        String(
          pedido || ""
        ).trim()

    };


    const baseUrl =

      req.protocol +

      "://" +

      req.get("host");


    // Consulta a validade.
    // Aceita JSON normal e JWT.
    const validade =

      await consultarValidadePix(
        pixLimpo
      );


    res.json({

      link:
        baseUrl +
        "/p/" +
        code,

      validade

    });

  }
);


// ======================================================
// PÁGINA DO CLIENTE
// ======================================================

app.get(
  "/p/:code",

  (req, res) => {


    const data =
      pixDB[
        req.params.code
      ];


    if (!data) {


      return res.send(`

<!doctype html>

<html lang="pt-BR">

<head>

  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>
    Link inválido
  </title>


  <style>

    body {

      font-family:
        Arial;

      background:
        #ffffff;

      color:
        #111;

      text-align:
        center;

      padding:
        40px 16px;
    }


    .box {

      background:
        #ffffff;

      padding:
        40px;

      border-radius:
        16px;

      display:
        inline-block;

      box-shadow:
        0 0 20px rgba(0,0,0,0.1);

      border:
        1px solid #ddd;

      max-width:
        420px;
    }

  </style>

</head>


<body>


  <div class="box">

    <h2>
      Link inválido
    </h2>

    <p>
      Esse link expirou ou não existe mais.
    </p>

  </div>


</body>

</html>

      `);

    }


    const pedidoSeguro =
      escaparHtml(
        data.pedido || "-"
      );


    const pixJson =
      JSON
        .stringify(data.pix)
        .replace(
          /</g,
          "\\u003c"
        );


    res.send(`

<!doctype html>

<html lang="pt-BR">

<head>


  <meta charset="utf-8">


  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >


  <title>
    Pagamento Pix
  </title>


  <script
    src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"
  ></script>


  <style>


    * {
      box-sizing:
        border-box;
    }


    body {

      font-family:
        Arial;

      background:
        #ffffff;

      color:
        #111;

      text-align:
        center;

      padding:
        40px 16px;

      margin:
        0;
    }


    .box {

      background:
        #ffffff;

      padding:
        40px;

      border-radius:
        16px;

      display:
        inline-block;

      box-shadow:
        0 0 20px rgba(0,0,0,0.1);

      border:
        1px solid #ddd;

      max-width:
        420px;

      width:
        100%;
    }


    h2 {

      margin-bottom:
        10px;
    }


    .pedido {

      font-weight:
        bold;

      margin-bottom:
        15px;
    }


    .steps {

      text-align:
        left;

      margin-top:
        20px;

      font-size:
        14px;
    }


    .step {

      margin-bottom:
        10px;
    }


    canvas {

      margin-top:
        20px;

      background:
        white;

      padding:
        10px;

      border-radius:
        10px;

      max-width:
        100%;

      height:
        auto !important;
    }


    button {

      background:
        #22c55e;

      border:
        none;

      padding:
        15px;

      font-size:
        16px;

      color:
        white;

      border-radius:
        10px;

      cursor:
        pointer;

      margin-top:
        25px;

      width:
        100%;
    }


    .ok {

      margin-top:
        10px;

      color:
        #22c55e;

      display:
        none;
    }


  </style>


</head>


<body>


  <div class="box">


    <h2>
      💸 Pagamento via Pix
    </h2>


    <div class="pedido">
      Pedido: ${pedidoSeguro}
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


    <canvas
      id="qrcode"
    ></canvas>


    <button
      onclick="copiar()"
    >
      📋 Copiar código Pix
    </button>


    <div
      class="ok"
      id="ok"
    >
      ✔ Copiado com sucesso
    </div>


  </div>


  <script>


    const pix =
      ${pixJson};


    QRCode.toCanvas(

      document
        .getElementById(
          "qrcode"
        ),

      pix

    );


    async function copiar() {


      await navigator
        .clipboard
        .writeText(pix);


      document
        .getElementById("ok")
        .style
        .display =
          "block";

    }


  </script>


</body>

</html>

    `);

  }
);


// ======================================================
// SERVIDOR
// ======================================================

const PORT =
  process.env.PORT ||
  3000;


app.listen(
  PORT,

  () => {

    console.log(
      "Rodando na porta " +
      PORT
    );

  }
);