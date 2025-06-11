# 새소식 (0.12 이전)

## 웹에서 Pong 데모 작동

이것을 해결하는 데 시간이 좀 걸렸습니다. 저는 `wasm-bindgen`을 작동시키는 데 어려움을 겪어서, 결국 `wasm-pack`을 사용하여 wasm을 만들게 되었습니다. 나중에 해결 방법을 찾았지만, 작업 흐름이 독자들에게 더 친숙할 것이라고 느껴 `wasm-pack`을 계속 사용하기로 결정했습니다.

더 일찍 공개할 수도 있었지만, 휴대폰 사용자들이 게임을 즐길 수 있도록 터치 지원을 추가하고 싶었습니다. 하지만 `winit`이 WASM 환경에서 터치 이벤트를 기록하지 않는 것 같아, 그 아이디어는 일단 보류했습니다.

데모를 확인하고 싶으시다면, [관련 글](../showcase/pong/#wasm-support)로 이동하세요.

## 0.12 Surface 추가 변경 사항

`SwapchainFrame`은 더 이상 사용되지 않습니다. 대신 `get_current_texture`가 `SurfaceTexture`를 직접 반환합니다. 즉, 렌더링할 프레임을 가져오는 코드는 다음과 같아집니다.

```rust
let output = self.surface.get_current_texture()?;
let view = output
    .texture
    .create_view(&wgpu::TextureViewDescriptor::default());
```

또 다른 변경 사항은 렌더 커맨드 버퍼를 `queue`에 제출한 후 `SurfaceTexture::present()`를 호출해야 한다는 것입니다. 다음과 같은 순서로 진행됩니다.

```rust
self.queue.submit(iter::once(encoder.finish()));
output.present();
```

WebGL 지원(이에 대해서는 꼭 다루어야겠습니다)과 같은 많은 내부적인 변경 사항이 있습니다. 더 자세한 내용은 wgpu의 [변경 로그](https://github.com/gfx-rs/wgpu/blob/master/CHANGELOG.md#wgpu-011-2021-10-07)에서 확인하실 수 있습니다.

## 0.10 버전용 Pong 수정 완료

수정 작업은 그다지 어렵지 않았습니다. 저는 렌더 모듈에서만 스왑체인을 직접 사용했고, 유일하게 필요했던 다른 변경 사항은 Cargo.toml의 wgpu에 `spirv` 기능을 추가하는 것이었습니다.

## 0.10 SwapChain의 시대는 가고, Surface의 시대가 왔습니다!

`SwapChain`과 모든 관련 코드가 wgpu에서 제거되었습니다. 이제 창에서 렌더링할 텍스처를 가져오는 모든 코드는 `Surface`에서 사용할 수 있습니다. 즉, `SurfaceTexture`를 설정하는 코드는 다음과 같아집니다.

```rust
let config = wgpu::SurfaceConfiguration {
    usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
    format: surface.get_supported_formats(&adapter)[0],
    width: size.width,
    height: size.height,
    present_mode: wgpu::PresentMode::Fifo,
};
surface.configure(&device, &config);
```

표면 크기를 조절하는 것도 비슷한 코드를 사용합니다.

```rust
if width > 0 && height > 0 {
    self.is_surface_configured = true;
    self.config.width = width;
    self.config.height = height;
    self.surface.configure(&self.device, &self.config);
}
```

마지막으로, 렌더링할 `SurfaceTexture`를 가져오는 것은 surface를 직접 사용합니다.

```rust
let output = self.surface.get_current_texture()?;
let view = output
    .texture
    .create_view(&wgpu::TextureViewDescriptor::default());
```

Pong과 imgui 예제는 다시 망가졌습니다. `imgui` 예제는 해당 크레이트에 이미 사용법 예제가 있기 때문에 제거할 수도 있습니다. Pong 예제를 재작업하는 것도 고려 중이지만, 아마 그냥 업데이트하는 것으로 끝날 것 같습니다.

## Pong 및 imgui 데모 수정 완료!

`imgui_wgpu`와 `wgpu_glyph` 크레이트가 `wgpu` 0.8 버전으로 업데이트되어 데모를 수정할 수 있었습니다! 두 데모 모두 여전히 GLSL을 사용하고 있으며, 당분간은 이를 바꿀 생각이 없습니다. 언젠가는 `naga`로 전환할 수도 있습니다.

## 0.8 및 WGSL

### GLSL 셰이더가 WGSL로 번역되었습니다

원래는 WGSL 사양이 완전히 안정될 때까지 기다리고 싶었지만, GLSL 코드의 몇 가지 문제 때문에 지금 코드를 전환하기로 결정했습니다. GLSL이 WebGPU에서 지원되기는 하지만, 현재 WGSL에 비해 부차적인 위치에 있습니다. GLSL 사용법 예제는 남겨둘 것이지만(그리고 HLSL과 Metal 예제도 추가할 수 있습니다), 앞으로는 WGSL을 사용할 것입니다.

### Shaderc가 제거되었습니다

이것은 한동안 고민해 온 문제입니다. shaderc는 C 라이브러리이기 때문에 빌드 중에 다시 다운로드해야 하는 경우가 많습니다. 이로 인해 새로운 콘텐츠를 추가하고 기존 콘텐츠를 유지 관리하는 속도가 느려졌습니다. 이전에 naga로 전환하는 것을 고려했지만, 제 셰이더 중 일부(특히 조명 관련 셰이더)는 호환성 문제로 사용할 수 없는 기능(`inverse`는 spirv를 타겟으로 하는 모든 언어에서 사용 불가)을 사용하고 있어 naga로 컴파일되지 않았습니다.

glsl을 만들기 위해 코드베이스에 많은 변경이 필요했고, 어차피 튜토리얼을 WGSL로 전환하고 싶었기 때문에, 큰마음을 먹고 모든 코드를 WGSL로 다시 작성하고 튜토리얼에서 shaderc를 제거하기로 결정했습니다.

### 일부 쇼케이스 예제가 망가졌습니다

`wgpu_glyph`와 `imgui-wgpu` 크레이트가 현재 `wgpu` 0.7 버전에 의존하고 있어 `pong`과 `imgui-demo`가 컴파일되지 않습니다. 기반이 되는 크레이트들이 `wgpu` 0.8 버전을 사용하도록 업데이트될 때까지 이들을 워크스페이스에서 제외하기로 결정했습니다. (이 문제가 해결되면 이슈나 PR을 제출해 주세요!)

### 다양한 API 변경 사항

*   `depth` 필드는 이제 `depth_or_array_layers`가 되었습니다.
*   `wgpu::VertexFormat::Float3`는 이제 `wgpu::VertexFormat::Float32x3`입니다. `Float2`와 `Float4`에도 비슷하게 적용됩니다.
*   `CullMode`는 더 이상 사용되지 않으며, 대신 `PrimitiveState::cull_mode`는 `Option<Face>`를 필요로 합니다.
*   `clamp_depth`와 `conservative`가 `PrimitiveState`에 추가되었습니다. 이로 인해 `DepthStencilState`에는 더 이상 `clamp_depth` 필드가 없습니다.
*   `color_blend`와 `alpha_blend`는 `Option<wgpu::BlendState>`를 받는 새로운 `blend` 필드로 이동했습니다.
*   `adapter.get_preferred_format()`은 이제 `Option<wgpu::TextureFormat>`을 반환합니다.
*   `wgpu::RenderPassColorAttachmentDescriptor`는 `wgpu::RenderPassColorAttachement`로 이름이 변경되었고, `attachment` 필드는 `view`로 이름이 변경되었습니다.
*   `wgpu::RenderPassDepthStencialAttachmentDescriptor`도 이름에서 `Descriptor` 부분이 사라졌습니다. `attachment` 역시 `view`로 이름이 변경되었습니다.
*   `wgpu::TextureCopyView`는 `wgpu::TexelCopyTextureInfo`로 이름이 변경되었습니다. 이는 `wgpu::TexelCopyTextureInfoBase<T>`의 타입 별칭(typedef)입니다.
*   `wgpu::TextureDataLayout`은 이제 `wgpu::TexelCopyBufferLayout`이며, `bytes_per_row`와 `rows_per_image`는 이제 `NonZeroU32`를 받습니다.
*   `wgpu::TexelCopyBufferInfo`는 이제 `wgpu::TexelCopyBufferInfo`입니다.

## 0.7

특히 `RenderPipelineDescriptor`에 많은 변경이 있었습니다. 대부분의 다른 것들은 변경되지 않았습니다. 전체 세부 내용은 [0.9 PR](https://github.com/sotrh/learn-wgpu/pull/140)에서 확인하실 수 있습니다.

## 2020년 11월 정리, 콘텐츠 동결, 그리고 Patreon

학교 일이 바빠지기 시작해서, 제가 원하는 만큼 사이트 작업에 시간을 할애하지 못했습니다. 그 때문에 몇몇 이슈들이 쌓이고 있었습니다. 그래서 한 번에 여러 이슈를 처리하기로 했습니다. 제가 한 작업의 일부입니다:

*   튜토리얼이 이제 `SurfaceError`를 제대로 처리합니다.
*   이제 모든 버퍼 데이터 구조체에 bytemuck의 derive 기능을 사용합니다.
*   [인스턴싱 튜토리얼](../beginner/tutorial7-instancing)은 이제 스토리지 버퍼 대신 버텍스 버퍼를 사용합니다.
*   `build.rs`는 이제 `/src`가 변경될 때마다 업데이트되는 대신, 개별 셰이더가 변경될 때 업데이트됩니다.
*   Github 사용자 @kanerogers의 도움을 받아 [텍스처링 튜토리얼](../beginner/tutorial5-textures)을 정리했습니다.
*   모델의 각 정점에 대한 탄젠트(tangent)와 바이탄젠트(bitangent)를 계산하는 [컴퓨트 파이프라인 쇼케이스](../showcase/compute)를 만들었습니다.
*   [imgui 쇼케이스](../showcase/imgui-demo)를 만들었습니다. 매우 기본적이지만, 좋은 시작점이 될 것입니다.

이제 헤드라인에서 "콘텐츠 동결"을 언급했습니다. Wgpu는 아직 계속해서 변화하는 프로젝트입니다. `0.4`에서 `0.5`로의 마이그레이션은 많은 작업이었습니다. `0.5`에서 `0.6`으로의 마이그레이션도 마찬가지였습니다. 다음 마이그레이션도 많은 노력이 필요할 것으로 예상됩니다. 따라서 API가 좀 더 안정될 때까지는 많은 콘텐츠를 추가하지 않을 것입니다. 그럼에도 불구하고, 기존 콘텐츠의 문제점은 계속해서 해결할 계획입니다.

그리고 한 가지 더. 사실 이런 말을 하기가 꽤 어색합니다만(특히 개발 속도를 늦출 예정이라서요), [Patreon](https://www.patreon.com/sotrh)을 시작했습니다. 제 직업이 시간을 많이 주지 않아 경제적으로 조금 빠듯합니다. 기부할 의무는 전혀 없지만, 후원해 주신다면 감사하겠습니다.

이 프로젝트에 기여하는 방법에 대한 자세한 내용은 [소개 페이지](../#contribution-and-support)에서 확인하실 수 있습니다.

## 0.6

이 작업은 너무 오래 걸렸습니다. 변경 사항 자체는 어렵지 않았지만, 복사-붙여넣기를 많이 해야 했습니다. 주요 변경 사항은 모든 곳에서 `queue.write_buffer()`와 `queue.write_texture()`를 사용하는 것입니다. 자세한 내용은 다루지 않겠지만, 관심 있으시면 [풀 리퀘스트](https://github.com/sotrh/learn-wgpu/pull/90)를 확인해 보세요.

## Pong 쇼케이스 추가

[여기서 확인하세요](../showcase/pong/)

## 노멀 매핑

이 부분은 제 완벽주의 때문에 약간의 어려움이 있었습니다. 제가 얻은 결과가 "물리적으로 정확한지" 확신할 수 없었지만, 보기에는 좋은 것 같습니다.

![](./normal_mapping_correct.png)

## 0.5!

너무 많은 것들이 바뀌어서 여기에 모두 기록하기는 어렵습니다. 구체적인 내용이 궁금하시다면 [0.5 풀 리퀘스트](https://github.com/sotrh/learn-wgpu/pull/29)를 확인하세요. 그럼에도 불구하고, 두 가지는 직접 언급할 가치가 있습니다: 이제 y축이 DirectX와 Metal처럼 위쪽을 가리키게 되었고, 어댑터를 요청하고 장치를 생성하는 것이 이제 `Future`를 사용하게 되었습니다. 튜토리얼과 코드도 모두 업데이트되었습니다.

## 조명 튜토리얼 재작업

[조명 튜토리얼](/intermediate/tutorial10-lighting/)이 수준에 미치지 못해서 다시 만들었습니다.

## GIF 쇼케이스 추가

[GIF 만들기](/showcase/gifs/)

## 텍스처 튜토리얼 업데이트

지금까지는 매번 텍스처를 수동으로 생성했습니다. 이제 텍스처 생성 코드를 새로운 `texture.rs` 파일로 분리하고, [텍스처 튜토리얼](/beginner/tutorial5-textures/#cleaning-things-up) 이후의 모든 튜토리얼에 포함시켰습니다.

## 올바른 `usage`를 지정하지 않아 발생하던 패닉 수정

Wgpu는 특정 작업을 수행할 때 필요한 `BufferUsages`와 `TextureUsages`에 대해 더 엄격해졌습니다. 예를 들어, [창 없는 Wgpu 예제](/intermediate/windowless/)에서 `texture_desc`는 `COPY_SRC` 사용법만 지정했습니다. 이로 인해 `texture`가 렌더 타겟으로 사용될 때 충돌이 발생했습니다. `OUTPUT_ATTACHMENT`를 추가하여 문제를 해결했습니다.

## Winit 0.20.0-alpha5에서 0.20으로 업데이트

DPI 관련 작동 방식에 많은 작은 변화가 있었습니다. 모든 변경 사항은 [변경 로그](https://github.com/rust-windowing/winit/blob/master/CHANGELOG.md)에서 확인하실 수 있습니다. 이로 인해 일부 튜토리얼을 변경해야 했습니다.

*   `State`에서 `hidpi_factor`를 완전히 제거했습니다. `winit::window::Window`에서 `hidpi_factor()` 메서드가 제거되었고, `inner_size()`가 `LogicalSize` 대신 `PhysicalSize`를 반환하도록 변경되었으므로 더 이상 `hidpi_factor`를 저장할 필요가 없습니다.
*   `update_hidpi_and_resize`는 더 이상 사용되지 않습니다. `ScaleFactorChanged`가 창의 새로운 `PhysicalSize`를 전달하므로, 간단히 `resize()`를 사용할 수 있습니다.
*   `State::size`는 이제 0.20 이전의 `LogicalSize` 대신 `PhysicalSize<u32>`입니다.
*   `EventsCleared`는 이제 `MainEventsCleared`입니다.

제가 놓친 변경 사항이 있을 수도 있지만, 모든 예제가 컴파일되고 실행되는 것을 확인했으므로, 코드에 문제가 있다면 이를 참조로 사용하실 수 있습니다.

## 튜토리얼 예제를 src 디렉토리를 사용하도록 변경

저는 기존의 cargo 바이너리 폴더 설정을 사용하지 않았습니다. 이제 표준화된 형태로 변경했습니다.

## 0.3에서 0.4로 업데이트
몇 가지 변경 사항이 있습니다:
1.  `Instance`의 사용이 제거되었습니다. `Surface`를 생성하고 `Adapter`를 요청하는 것은 다음과 같이 수행됩니다.
    ```rust
    let surface = wgpu::Surface::create(window);
    let adapter = wgpu::Adapter::request(&wgpu::RequestAdapterOptions {
        ..Default::default()
    }).unwrap(); // unwrap이 필요합니다
    ```
2.  `request_device` 메서드는 이제 `(Device, Queue)` 튜플을 반환합니다. 이는 `Device`를 불변으로 빌려 쓰는 동안 `Queue`를 가변으로 빌려 쓸 수 있음을 의미합니다. 이 변경으로 인해 `CommandBuffer`를 큐에 제출하는 것은 `Queue`의 `submit` 메서드를 직접 사용합니다.
    ```rust
    self.queue.submit(&[
        encoder.finish()
    ]);
    ```
3.  `Surface`의 `create` 메서드는 `RawWindowHandle` 대신 `HasRawWindow` 트레이트를 구현하는 모든 구조체를 받습니다. 이는 `Cargo.toml`의 `raw-window-handle = "0.3"` 줄이 더 이상 필요하지 않음을 의미합니다.

이것이 0.4 버전의 변경 사항인지는 확실하지 않지만, 이제 `[dependencies.wgpu]` 대신 의존성에 `wgpu = "0.4"` 줄을 사용합니다. wgpu가 여러분을 위해 최적의 백엔드를 결정할 것입니다.

## 신규/최근 기사
<RecentArticles/>
