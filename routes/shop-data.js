const express = require("express");
const router = express.Router();

const {
    getAllCollections,
    getProductsByCollection
} = require("../services/shopify");

/**
 * 🔥 Endpoint principal pour récupérer les produits & collections
 * Utilisé par WordPress dans produits.php
 */
router.get("/shop-data", async (req, res) => {
    try {
        const shopUrl = req.headers["x-shopify-url"];
        const token = req.headers["x-shopify-token"];

        if (!shopUrl || !token) {
            return res.status(400).json({
                success: false,
                error: "Credentials missing in headers (x-shopify-url / x-shopify-token)"
            });
        }

        console.log("📦 Boutique demandée :", shopUrl);

        // 1️⃣ Récup collections
        const collections = await getAllCollections(req);

        // 2️⃣ Récupérer les produits de chaque collection
        for (let col of collections) {
            const products = await getProductsByCollection(req, col.id);

            col.products = products.map(p => ({
                id: p.id,
                title: p.title,
                body_html: p.body_html,
                handle: p.handle
            }));
        }

        res.json({
            success: true,
            data: {
                collections
            }
        });

    } catch (error) {
        console.error("❌ Error /shop-data :", error.response?.data || error.message);

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = r
