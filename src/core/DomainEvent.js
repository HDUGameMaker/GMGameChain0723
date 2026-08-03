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
  if (!Number.isInteger(sequence) || sequence <= 0) throw new RangeError('invalid_event_sequence');
  if (typeof type !== 'string' || type.length === 0) throw new TypeError('missing_event_type');
  if (!Number.isInteger(day)) throw new RangeError('invalid_event_day');
  if (!Number.isInteger(tick)) throw new RangeError('invalid_event_tick');

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
