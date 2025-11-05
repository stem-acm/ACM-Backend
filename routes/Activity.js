const express = require('express');
const router = express.Router();
const { Activity } = require('../models');
const authentification = require('../middleware');

router.post('/', authentification, async (req, res) => {
  try {
    const createdBy = req.user.id;
    const { name, description, image, isActive } = req.body;
    const activty = await Activity.create({
      name,
      description,
      image,
      isActive,
      createdBy,
    });
    res.status(201).json({ success: true, message: 'Activity created successfully', data: activty });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message ??= 'Error creating activty', data: null });
  }
});

router.get('/', async (req, res) => {
  try {
    const activities = await Activity.findAll({ order: [['id', 'ASC']] });
    res.status(201).json({ success: true, message: 'All activities', data: activities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message ??= 'Error getting activty', data: null });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const activity = await Activity.findByPk(req.params.id);
    if (!activity) {
        res.status(404).json({ success: false, message: 'Activity not found', data: null });
    }
    res.status(201).json({ success: true, message: 'Activity founds', data: activity });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message ??= 'Error getting activty', data: null });
  }
});

router.put('/', authentification, async (req, res) => {
  try {
    const { id, ...updateData } = req.body;
    const [affectedRows] = await Activity.update(updateData, {
      where: { id }
    });
    res.status(201).json({ success: true, message: 'Activity updated successfully', data: affectedRows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message ??= 'Error updating activty', data: null });
  }
});

router.delete('/:id', authentification, async (req, res) => {
  try {
    const { id } = req.params;
    const activityDestroy = await Activity.destroy({ where: { id } });
    res.status(201).json({ success: true, message: 'Activity deleted successfully', data: affectedRows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message ??= 'Error deleting activty', data: null });
  }
});

module.exports = router;