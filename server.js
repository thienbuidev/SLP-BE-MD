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

app.get("/", (req, res) => {
  res.send("Server is up and running!");
});

app.get("/actions", async (req, res) => {
  console.log("object", req.body);

  const { assetId, statusLight } = req.body;

  // console.log(req.body.assetId);
  // console.log(req.body.statusLight);

  try {
    const response = await axios.post(
      `${THINGSBOARD_URL}/api/relations`,
      {
        parameters: {
          // rootId: "55bc74d0-e90f-11ef-87c3-b9314a2c2c87",
          rootId: assetId,
          rootType: "DEVICE",
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

      const telemetryData = telemetryRes.data.data_UID[0];
      const dataUid = telemetryData.value;

      const attributesData = attributesRes.data[0];
      const devEui = attributesData.value;

      const hexString = encodeHexString(dataUid, statusLight);
      const base64String = decodeHexToBase64(hexString);
      // console.log("base64String", base64String);
      // console.log("hexString", hexString);
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
      console.log("chirpstackRes", chirpstackRes.data);
    }
    res.status(200).json({ message: "Received successfully" });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function encodeHexString(data_UID, status_Light) {
  const fixedValues = "680106F0002001";
  const uidHex = data_UID.toUpperCase();
  let actionHex;
  let dimmingLevel;
  if (status_Light === "Light On") {
    actionHex = "21";
    dimmingLevel = "64";
  } else if (status_Light === "Light Off") {
    actionHex = "22";
    dimmingLevel = "00";
  } else {
    return { error: "Invalid light action" };
  }
  // const actionHex = "21";
  // const dimmingLevel = "64";

  const hexStringWithoutChecksum = `68${uidHex}${fixedValues}${actionHex}${dimmingLevel}`;

  const sum = hexStringWithoutChecksum
    .match(/.{1,2}/g)
    .reduce((acc, hex) => acc + parseInt(hex, 16), 0);

  const checksumHex = sum.toString(16).toUpperCase().slice(-2).padStart(2, "0");

  return `${hexStringWithoutChecksum}${checksumHex}16`;
}

function decodeHexToBase64(hexString) {
  return Buffer.from(hexString, "hex").toString("base64");
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
