require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const THINGSBOARD_URL = process.env.THINGSBOARD_URL;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

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

app.post("/actions", async (req, res) => {
  try {
    // const { assetId } = req.params;
    // const { action } = req.body;

    // if (!assetId || !action) {
    //   return res
    //     .status(400)
    //     .json({ error: "Asset ID and action are required" });
    // }

    // const bodyParams = {
    //   parameters: {
    //     rootId: "e5c89710-ed11-11ef-82b3-956af2275673",
    //     rootType: "ASSET",
    //     direction: "FROM",
    //     relationTypeGroup: "COMMON",
    //     maxLevel: 1073741824,
    //     fetchLastLevelOnly: true,
    //   },
    // };

    // if (action === "turn-on") {
    // } else if (action === "turn-off") {
    // }

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

      console.log("object", telemetryRes.data, attributesRes.data);
    }

    res.status(200).json({ message: "Received successfully" });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
