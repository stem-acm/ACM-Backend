const express = require('express');
const router = express.Router();
const { Member } = require('../models'); // <-- Assure-toi que ton modèle est bien exporté dans /models/index.js
const authentification = require('../middleware');

router.post('/', authentification, async (req, res) => {
  try {
    const member = await Member.create(req.body);
    const registrationNumber = `${member.id.toString()}`;
    
    // Mettre à jour le membre avec ce registrationNumber
    await member.update({ registrationNumber });
    res.status(201).json({ success: true, message: 'Member created successfully', data: member });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message ??= 'Error creating member', data: null });
  }
});

router.put('/', authentification, async (req, res) => {
  try {
    const { createdAt, updatedAt, id, registrationNumber, ...updateData } = req.body;
    const member = await Member.update(updateData, { where: { id } });
    res.status(201).json({ success: true, message: 'Member updated successfully', data: member });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message ??= 'Error creating member', data: null });
  }
});

router.get('/', async (req, res) => {
  try {
    const members = await Member.findAll();
    res.status(200).json({
        success: true,
        message: members.length > 0 ? 'Members retrieved successfully' : 'No members found',
        data: members
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching members', data: null });
  }
});

router.get('/:id', authentification, async (req, res) => {
  try {
    const member = await Member.findByPk(req.params.id);

    if (!member) {
    return res.status(404).json({
        success: false,
        message: 'Member not found',
        data: null
    });
    }

    res.status(200).json({
      success: true,
      message: 'Member retrieved successfully',
      data: member
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching member', data: null });
  }
});

router.get('/reg/:registrationNumber', async (req, res) => {
  try {
    const member = await Member.findOne({
      where: { registrationNumber: req.params.registrationNumber }
    });

    if (!member) {
      return res.json({
          success: false,
          message: 'Member not found',
          data: null
      });
    }

    res.status(200).json({
      success: true,
      message: 'Member retrieved successfully',
      data: member
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching member', data: null });
  }
});

module.exports = router;