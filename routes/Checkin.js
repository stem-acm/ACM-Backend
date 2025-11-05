const express = require('express');
const router = express.Router();
const { Checkin, Member } = require('../models');
const authentification = require('../middleware');

router.post('/', async (req, res) => {
  try {
    const { registrationNumber, activityId, checkInTime, checkOutTime, visitReason } = req.body;

    const member = await Member.findOne({ where: { registrationNumber }});

    if (!member) return res.json({ success: false, message: 'Member is not registred', data: null });

    const checkin = await Checkin.create({
      registrationNumber,
      activityId,
      checkInTime,
      checkOutTime,
      visitReason,
    });
    res.status(201).json({ success: true, message: 'Checkin created successfully', data: checkin });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message ??= 'Error creating checkin', data: null });
  }
});

router.get('/', async (req, res) => {
  try {
    const checkins = await Checkin.findAll({ order: [['id', 'DESC']] });
    res.status(201).json({ success: true, message: 'All checkin', data: checkins });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message ??= 'Error getting checkins', data: null });
  }
});

router.get('/:registrationNumber', async (req, res) => {
  try {
    const registrationNumber = req.params.registrationNumber;
    const checkins = await Checkin.find({ where: {registrationNumber} });
    if (!checkins) {
        res.status(404).json({ success: false, message: 'no checkin found for this member', data: null });
    }
    res.status(201).json({ success: true, message: 'Checkins founds', data: checkins });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message ??= 'Error getting checkins', data: null });
  }
});

module.exports = router;