const express = require("express");
const router = express.Router();

const {
    createDynamicClient,
    getAllCollections,
    getAllProducts
} = require("../services/shopify");

// --------------------------------------------------------------
// 🔥 ROUTE : GET /api/shop-data
// Retourne toutes les collections + produits pour la boutique active
// --------------------------------------------------------------
router.get("/shop-data", async (req, res) => {
    try {
        const shopUrl = req.headers["x-shopify-url"];
        const token = req.headers["x-shopify-token"];

        if (!shopUrl || !token) {
            return res.status(400).json({
                success: false,
                error: "Missing shop credentials"
            });
        }

        // Client Shopify dynamique
        const client = createDynamicClient(shopUrl, token);

        // Récup collections
        const collections = await getAllCollections(client);

        // Ajouter produits pour chaque collection
        for (let col of collections) {
            col.products = await getAllProducts(client);
        }

        res.json({
            success: true,
            data: {
                shop: shopUrl,
                collections
            }
        });

    } catch (err) {
        console.error("❌ Error /shop-data:", err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

module.exports = router;
