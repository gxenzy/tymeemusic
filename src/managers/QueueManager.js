export class QueueManager {
  player;

  constructor(player) {
    this.player = player;
  }

  _notifyDashboard() {
    if (this.player.manager?.client?.webServer) {
      this.player.manager.client.webServer.updatePlayerState(this.player.guildId);
    }
  }

  get tracks() {
    return this.player.queue.tracks;
  }

  get previous() {
    return this.player.queue.previous;
  }

  get current() {
    return this.player.queue.current;
  }

  get totalDuration() {
    return this.player.queue.utils.totalDuration();
  }

  async add(trackOrTracks, index) {
    const tracks = Array.isArray(trackOrTracks) ? trackOrTracks : [trackOrTracks];
    if (index !== undefined && index !== null) {
      this.tracks.splice(index, 0, ...tracks);
    } else {
      this.tracks.push(...tracks);
    }
    await this.player.queue.utils.save();
    this._notifyDashboard();
    return tracks;
  }

  async addToTop(trackOrTracks) {
    const tracks = Array.isArray(trackOrTracks) ? trackOrTracks : [trackOrTracks];
    const result = await this.player.queue.splice(0, 0, ...tracks);
    this._notifyDashboard();
    return result;
  }

  async remove(start, end = start) {
    if (end < start) [start, end] = [end, start];
    const result = this.tracks.splice(start, end - start + 1);
    await this.player.queue.utils.save();
    this._notifyDashboard();
    return result;
  }

  async move(from, to) {
    const [track] = this.tracks.splice(from, 1);
    if (track) {
      this.tracks.splice(to, 0, track);
      await this.player.queue.utils.save();
      this._notifyDashboard();
    }
  }

  async shuffle() {
    const result = await this.player.queue.shuffle();
    this._notifyDashboard();
    return result;
  }

  /**
   * Generate a preview of what the shuffled queue would look like
   * without actually modifying the queue
   * @returns {Array} Preview of shuffled track order
   */
  shufflePreview() {
    const tracks = [...this.tracks]; // Clone array
    // Fisher-Yates shuffle
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    return tracks.map((t, idx) => ({
      position: idx + 1,
      title: t.info?.title || 'Unknown',
      author: t.info?.author || 'Unknown',
      duration: t.info?.duration || 0,
      identifier: t.info?.identifier
    }));
  }

  async clear() {
    const clearedCount = this.tracks.length;
    this.tracks.splice(0, clearedCount);
    await this.player.queue.utils.save();
    this._notifyDashboard();
    return clearedCount;
  }

  async splice(index, amount, ...tracks) {
    const result = this.tracks.splice(index, amount, ...tracks);
    await this.player.queue.utils.save();
    this._notifyDashboard();
    return result;
  }

  toJSON() {
    return this.player.queue.utils.toJSON();
  }
}
