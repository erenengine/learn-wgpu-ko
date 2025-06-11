# 0.16 업데이트

이번 업데이트는 변경점이 거의 없습니다! 이제 더 이상 `NonZeroU32`와 같은 타입을 사용할 필요 없이, 대신 `Option<u32>`를 사용하게 됩니다. 이 변경점은 주로 텍스처를 다룰 때 적용됩니다.

```rust
queue.write_texture(
    wgpu::TexelCopyTextureInfo {
        aspect: wgpu::TextureAspect::All,
        texture: &texture,
        mip_level: 0,
        origin: wgpu::Origin3d::ZERO,
    },
    &rgba,
    wgpu::TexelCopyBufferLayout {
        offset: 0,
        // bytes_per_row: NonZeroU32::new(4 * dimensions.0),
        bytes_per_row: Some(4 * dimensions.0),
        // rows_per_image: NonZeroU32::new(dimensions.1),
        rows_per_image: Some(dimensions.1),
    },
    is_surface_configured: false,
);
```

다른 소식으로는, WebGPU가 크롬 113 및 상위 버전에 추가되었습니다! 현재 리눅스용 크롬 베타 버전에서는 작동하지 않으며, 파이어폭스에서는 작동하긴 하지만, 저는 WebGL 호환성 모드 대신 네이티브 WebGPU를 사용하도록 전환하는 것을 잠시 보류할 생각입니다. 만약 브라우저에서 WebGPU를 사용해보고 싶으시다면, <https://caniuse.com/webgpu>에서 사용하시는 브라우저의 지원 여부를 확인한 후, `Cargo.toml` 파일의 `[target.'cfg(target_arch = "wasm32")'.dependencies]` 섹션에서 아래 `wgpu` 라인을 삭제하세요:

```toml
[target.'cfg(target_arch = "wasm32")'.dependencies]
reqwest = { version = "0.11" }
console_error_panic_hook = "0.1"
console_log = "1.0"
# wgpu = { version = "25.0", features = ["webgl"]}
wasm-bindgen = "0.2"
wasm-bindgen-futures = "0.4"
web-sys = { version = "0.3", features = [
    "Document",
    "Window",
    "Element",
    "Location",
]}
```

브라우저에서 WebGPU를 사용하도록 전환하기 위해 필요한 다른 변경 사항은 없습니다. 따라서 리눅스용 크롬에서 <https://webgpu.github.io/>의 WebGPU 샘플들이 작동하는 것이 확인되면, `webgl` 기능을 제거하는 것을 검토해 보겠습니다.

이게 전부입니다! 늘 그렇듯이, 제가 놓친 부분이 있다면 알려주세요
