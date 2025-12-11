const express = require("express");
const router = express.Router();
const { createDynamicClient } = require("../services/shopify");

router.get("/shop-data", async (req, res) => {
    try {
        const shopUrl = req.headers["x-shopify-url"];
        const token = req.headers["x-shopify-token"];

        if (!shopUrl || !token) {
            return res.status(400).json({
                success: false,
                error: "Missing Shopify credentials"
            });
        }

        // Création du client Shopify dynamique
        const client = createDynamicClient(shopUrl, token);

        // 🔥 Récupérer produits + collections
        const collections = await client.get(`/custom_collections.json?limit=250`);
        const smart = await client.get(`/smart_collections.json?limit=250`);

        let allCollections = [
            ...collections.data.custom_collections,
            ...smart.data.smart_collections
        ];

        // Charger les produits de chaque collection
        for (let col of allCollections) {
            const p = await client.get(`/collections/${col.id}/products.json?limit=250`);
            col.products = p.data.products || [];
        }

        res.json({
            success: true,
            data: {
                collections: allCollections
            }
        });

    } catch (error) {
        console.error("❌ shop-data error:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
