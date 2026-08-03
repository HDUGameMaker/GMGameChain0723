/** Resolve the dedicated score for an era without coupling audio to EraSystem. */
export function getEraTrackId(soundConfig, eraId = 'primitive') {
  const tracks = (soundConfig?.bgm || []).filter(track => track.eraId);
  return tracks.find(track => track.eraId === eraId)?.id || tracks[0]?.id || soundConfig?.bgm?.[0]?.id || null;
}
