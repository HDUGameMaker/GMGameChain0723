const MAX_EVENT_SEQUENCE = 999_999_999_999;

export function createDomainEvent({
  sequence,
  type,
  day,
  tick,
  actorId,
  targetId,
  correlationId,
  payload
}) {
  if (!Number.isSafeInteger(sequence) || sequence <= 0 || sequence > MAX_EVENT_SEQUENCE) {
    throw new RangeError('invalid_event_sequence');
  }
  if (typeof type !== 'string' || type.trim().length === 0) throw new TypeError('missing_event_type');
  if (!Number.isSafeInteger(day)) throw new RangeError('invalid_event_day');
  if (!Number.isSafeInteger(tick)) throw new RangeError('invalid_event_tick');

  return {
    eventId: `evt_${String(sequence).padStart(12, '0')}`,
    type,
    schemaVersion: 1,
    day,
    tick,
    actorId,
    targetId,
    correlationId,
    payload: structuredClone(payload)
  };
}
