'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Checkins', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      registrationNumber: {
        type: Sequelize.STRING
      },
      activityId: {
        type: Sequelize.INTEGER
      },
      checkInTime: {
        type: Sequelize.DATE
      },
      checkOutTime: {
        type: Sequelize.DATE
      },
      visitReason: {
        type: Sequelize.TEXT
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Checkins');
  }
};