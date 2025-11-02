const express = require('express');
const router = express.Router();
const { Member, User } = require('../models');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const SECRET = process.env.SECRET_KEY;
const jwt = require('jsonwebtoken');
const authentification = require('../middleware');

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ where: { username } });

        if (!user) return res.status(404).json({ success: false, message: 'User not found', data: null });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Password invalide', data: null });

        const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '1d' });
        
        // Supprimer le mot de passe du user
        const { password: _, ...userWithoutPassword } = user.toJSON();

        res.status(200).json({
        success: true,
        message: 'User connected successfully',
        data: {
            token,
            user: userWithoutPassword
        }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', data: null });
    }
});

router.get('/token', async (req, res) => {
    try {
        
        const { auth: token } = req.query;
        if (!token) throw new Error("Token not found");

        const { id, email } = jwt.verify(token, SECRET);
        const user = await User.findOne({ where: {id, email}});

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found', data: null });
        }

        // Supprimer le mot de passe du user
        const { password: _, ...userWithoutPassword } = user.toJSON();

        res.status(200).json({
            success: true,
            message: 'token valide',
            data: userWithoutPassword
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message ??= 'Server error', data: null });
    }
});

router.post('/register', authentification, async (req, res, next) => {
    try {
        const { username, email, password } = req.body;
        const _user = await User.findOne({where: {email}});

        if(_user) {
            throw new Error("email already exist");
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({ username, email, password: hashedPassword });

        // Supprimer le mot de passe du user
        const { password: _, ...userWithoutPassword } = user.toJSON();
        res.status(200).json({
            success: true,
            message: 'User retrieved successfully',
            data: userWithoutPassword
        });
    } catch (err) {
        res.status(400).json({ success: false, message: 'error creating user', data: null });
    }
});

module.exports = router;