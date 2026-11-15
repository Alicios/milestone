class File {
  constructor() {
    this.exists = false;
    this.uri = 'file:///test-photo.jpg';
  }

  write() {}
  delete() {}
  bytes() { return Promise.resolve(new Uint8Array()); }
}

module.exports = { File, Paths: { document: 'file:///documents' } };
