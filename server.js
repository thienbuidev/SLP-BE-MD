require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const THINGSBOARD_URL = process.env.THINGSBOARD_URL;
const CHIRPSTACK_URL = process.env.CHIRPSTACK_URL;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const ACCESS_TOKEN_CHIRPSTACK = process.env.ACCESS_TOKEN_CHIRPSTACK;

app.use(express.json());

// API nhận request từ ThingsBoard
// app.post("/thingsboard/webhook", async (req, res) => {
//   try {
//     console.log("Received data:", req.body);
//     res.status(200).json({ message: "Received successfully" });
//   } catch (error) {
//     console.error("Error processing request:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

app.get("/actions", async (req, res) => {
  try {
    const response = await axios.post(
      `${THINGSBOARD_URL}/api/relations`,
      {
        parameters: {
          rootId: "55bc74d0-e90f-11ef-87c3-b9314a2c2c87",
          rootType: "ASSET",
          direction: "FROM",
          relationTypeGroup: "COMMON",
          maxLevel: 1073741824,
          fetchLastLevelOnly: true,
        },
        filters: [
          {
            relationType: "Contains",
            entityTypes: ["DEVICE"],
            negate: true,
          },
        ],
      },
      {
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "X-Authorization": `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );

    const deviceIds = response.data
      .filter((item) => item.to.entityType === "DEVICE")
      .map((item) => item.to.id);

    console.log("deviceIds", deviceIds);

    for (const deviceId of deviceIds) {
      const [telemetryRes, attributesRes] = await Promise.all([
        axios.get(
          `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=data_UID`,
          {
            headers: {
              accept: "application/json",
              "Content-Type": "application/json",
              "X-Authorization": `Bearer ${ACCESS_TOKEN}`,
            },
          }
        ),
        axios.get(
          `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes?keys=dev_eui`,
          {
            headers: {
              accept: "application/json",
              "Content-Type": "application/json",
              "X-Authorization": `Bearer ${ACCESS_TOKEN}`,
            },
          }
        ),
      ]);

      // console.log("telemetry", telemetryRes.data);
      // console.log("attribute", attributesRes.data);

      const telemetryData = telemetryRes.data.data_UID[0];
      const dataUid = telemetryData.value;

      const attributesData = attributesRes.data[0];
      const devEui = attributesData.value;

      const hexString = encodeHexString(dataUid);
      const base64String = decodeHexToBase64(hexString);
      console.log("base64String", base64String);
      console.log("hexString", hexString);
      // CALL API CHIRPSTACK (Multicast)
      await new Promise((resolve) => setTimeout(resolve, 6000));

      const chirpstackRes = await axios.post(
        `${CHIRPSTACK_URL}/api/devices/${devEui}/queue`,
        {
          queueItem: {
            confirmed: false,
            data: base64String,
            fPort: 10,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Grpc-Metadata-Authorization": `Bearer ${ACCESS_TOKEN_CHIRPSTACK}`,
          },
        }
      );
      console.log("chirpstackRes", chirpstackRes);
    }
    res.status(200).json({ message: "Received successfully" });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function encodeHexString(data_UID) {
  const fixedValues = "680106F0002001";
  const uidHex = data_UID.toUpperCase();
  const actionHex = "22";
  const dimmingLevel = "00";

  const hexStringWithoutChecksum = `68${uidHex}${fixedValues}${actionHex}${dimmingLevel}`;

  const sum = hexStringWithoutChecksum
    .match(/.{1,2}/g)
    .reduce((acc, hex) => acc + parseInt(hex, 16), 0);

  const checksumHex = sum.toString(16).toUpperCase().slice(-2).padStart(2, "0");

  return `${hexStringWithoutChecksum}${checksumHex}16`;
}

function decodeHexToBase64(hexString) {
  const base64Chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let binaryStr = "";

  for (let i = 0; i < hexString.length; i += 2) {
    let byte = parseInt(hexString.substring(i, i + 2), 16);
    binaryStr += String.fromCharCode(byte);
  }

  let result = "";
  let padding = "";

  if (binaryStr.length % 3 === 1) {
    padding = "==";
    binaryStr += "\0\0";
  } else if (binaryStr.length % 3 === 2) {
    padding = "=";
    binaryStr += "\0";
  }

  // Chuyển từ nhị phân sang Base64
  for (let i = 0; i < binaryStr.length; i += 3) {
    let n =
      (binaryStr.charCodeAt(i) << 16) |
      (binaryStr.charCodeAt(i + 1) << 8) |
      binaryStr.charCodeAt(i + 2);

    result +=
      base64Chars[(n >> 18) & 63] +
      base64Chars[(n >> 12) & 63] +
      base64Chars[(n >> 6) & 63] +
      base64Chars[n & 63];
  }

  return result.substring(0, result.length - padding.length) + padding;
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
