export interface CheckinValidationResult {
  allowed: boolean;
  reason?: string;
  slot?: CheckinSlot;
}

export type CheckinSlot = 'TUE_AM' | 'TUE_PM' | 'WED_AM' | 'WED_PM' | 'THU_AM' | 'THU_PM' | 'FRI_AM' | 'FRI_PM' | 'SAT';

export function getCheckinSlot(date: Date): CheckinSlot | null {
  const day = date.getDay(); // 0 is Sunday
  const hours = date.getHours();

  // Monday (1) and Sunday (0) are not allowed
  if (day === 0 || day === 1) {
    return null;
  }

  // Saturday (6)
  if (day === 6) {
    if (hours >= 9 && hours < 16) {
      return 'SAT';
    }
    return null;
  }

  // Tuesday (2) to Friday (5)
  if (day >= 2 && day <= 5) {
    // 8:00 to 12:00
    if (hours >= 8 && hours < 12) {
      const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      return `${days[day]}_AM` as CheckinSlot;
    }
    // 15:00 to 18:00
    if (hours >= 15 && hours < 18) {
      const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      return `${days[day]}_PM` as CheckinSlot;
    }
  }

  return null;
}

export function validateCheckinTime(date: Date): CheckinValidationResult {
  const day = date.getDay();

  if (day === 0 || day === 1) {
    return {
      allowed: false,
      reason: 'Check-ins are not allowed on Mondays and Sundays.',
    };
  }

  const slot = getCheckinSlot(date);
  
  if (!slot) {
    if (day === 6) {
      return {
        allowed: false,
        reason: 'On Saturdays, check-in is only allowed between 09:00 and 16:00.',
      };
    }
    return {
      allowed: false,
      reason: 'Check-in is only allowed between 08:00-12:00 and 15:00-18:00 on weekdays.',
    };
  }

  return {
    allowed: true,
    slot,
  };
}
