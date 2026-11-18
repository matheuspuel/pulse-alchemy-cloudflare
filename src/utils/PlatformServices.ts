import { FileSystem, Layer, Path } from 'effect'
import { Etag, HttpPlatform } from 'effect/http'

export const PlatformServices = Layer.mergeAll(
  HttpPlatform.layer.pipe(Layer.provide(FileSystem.layerNoop({}))),
  Etag.layer,
  Path.layer,
)
