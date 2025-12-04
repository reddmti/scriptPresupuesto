import express from 'express';
import webhookController from '../controllers/webhookController';

const router = express.Router();

// Verificación del webhook (GET)
router.get('/webhook', (req, res) => webhookController.verify(req, res));

// Recepción de mensajes (POST)
router.post('/webhook', (req, res) => webhookController.receiveMessage(req, res));

export default router;
