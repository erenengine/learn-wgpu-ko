# 표면(The Surface)

## 먼저, 사전 작업: State

지난 튜토리얼에서 state를 만들었으니, 이제 그 안에 내용을 채워봅시다.

```rust
// lib.rs

pub struct State {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    is_surface_configured: bool,
    window: Arc<Window>,
}
```

`State`의 필드들을 간단히 훑어보겠지만, 이 메서드들 뒤에 있는 코드를 설명하면서 더 명확해질 것입니다.

## State::new()

이 코드는 꽤 직관적이지만, 조금 더 자세히 살펴보겠습니다.

```rust
impl State {
    // ...
    async fn new(window: Arc<Window>) -> anyhow::Result<State> {
        let size = window.inner_size();

        // instance는 GPU에 대한 핸들입니다.
        // BackendBit::PRIMARY는 Vulkan + Metal + DX12 + 브라우저 WebGPU를 의미합니다.
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            #[cfg(not(target_arch = "wasm32"))]
            backends: wgpu::Backends::PRIMARY,
            #[cfg(target_arch = "wasm32")]
            backends: wgpu::Backends::GL,
            ..Default::default()
        });

        let surface = instance.create_surface(window.clone()).unwrap();

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::default(),
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await?;

        // ...
    }
```

### Instance와 Adapter

`instance`는 wgpu를 사용할 때 가장 먼저 만드는 것입니다. 이것의 주된 목적은 `Adapter`와 `Surface`를 만드는 것입니다.

`adapter`는 실제 그래픽 카드에 대한 핸들입니다. 이를 사용하여 그래픽 카드의 이름이나 어댑터가 사용하는 백엔드와 같은 정보를 얻을 수 있습니다. 나중에 `Device`와 `Queue`를 만들 때 이것을 사용합니다. `RequestAdapterOptions`의 필드에 대해 논의해 봅시다.

*   `power_preference`는 `LowPower`와 `HighPerformance` 두 가지 변형이 있습니다. `LowPower`는 내장 GPU와 같이 배터리 수명을 우선시하는 어댑터를 선택합니다. `HighPerformance`는 전용 그래픽 카드처럼 더 많은 전력을 소모하지만 더 성능이 좋은 GPU용 어댑터를 선택합니다. WGPU는 `HighPerformance` 옵션에 대한 어댑터가 없는 경우 `LowPower`를 우선적으로 선택합니다.
*   `compatible_surface` 필드는 wgpu에게 제공된 표면(surface)에 출력할 수 있는 어댑터를 찾으라고 지시합니다.
*   `force_fallback_adapter`는 wgpu가 모든 하드웨어에서 작동하는 어댑터를 선택하도록 강제합니다. 이는 일반적으로 렌더링 백엔드가 GPU와 같은 하드웨어 대신 "소프트웨어" 시스템을 사용한다는 것을 의미합니다.

<div class="note">

제가 `request_adapter`에 전달한 옵션들은 모든 장치에서 작동한다고 보장되지는 않지만, 대부분의 장치에서 작동할 것입니다. wgpu가 필요한 권한을 가진 어댑터를 찾지 못하면 `request_adapter`는 `None`을 반환합니다. 특정 백엔드에 대한 모든 어댑터를 얻고 싶다면 `enumerate_adapters`를 사용할 수 있습니다. 이것은 여러분의 필요에 맞는 어댑터가 있는지 확인하기 위해 반복할 수 있는 이터레이터를 제공합니다.

```rust
let adapter = instance
    .enumerate_adapters(wgpu::Backends::all())
    .filter(|adapter| {
        // 이 어댑터가 우리 surface를 지원하는지 확인
        adapter.is_surface_supported(&surface)
    })
    .next()
    .unwrap()
```

한 가지 유의할 점은 `enumerate_adapters`는 WASM에서 사용할 수 없으므로 `request_adapter`를 사용해야 한다는 것입니다.

또 다른 점은 `Adapter`는 특정 백엔드에 고정된다는 것입니다. Windows를 사용하고 그래픽 카드가 두 개 있다면, 최소한 4개의 어댑터를 사용할 수 있습니다: 2개의 Vulkan과 2개의 DirectX.

검색을 구체화하는 데 사용할 수 있는 더 많은 필드는 [문서](https://docs.rs/wgpu/latest/wgpu/struct.Adapter.html)를 확인하세요.

</div>

### 표면(The Surface)

`surface`는 우리가 그리는 창(window)의 일부입니다. 화면에 직접 그리기 위해 필요합니다. `surface`를 생성하려면 우리 `window`가 [raw-window-handle](https://crates.io/crates/raw-window-handle)의 `HasRawWindowHandle` 트레이트(trait)를 구현해야 합니다. 다행히 winit의 `Window`가 이 조건을 만족합니다. 또한 `adapter`를 요청하는 데에도 필요합니다.

### Device와 Queue

`adapter`를 사용하여 device와 queue를 만들어 봅시다.

```rust
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: None,
                required_features: wgpu::Features::empty(),
                // WebGL은 wgpu의 모든 기능을 지원하지 않으므로,
                // 웹용으로 빌드하는 경우 일부 기능을 비활성화해야 합니다.
                required_limits: if cfg!(target_arch = "wasm32") {
                    wgpu::Limits::downlevel_webgl2_defaults()
                } else {
                    wgpu::Limits::default()
                },
                memory_hints: Default::default(),
                trace: wgpu::Trace::Off,
            })
            .await?;
```

`DeviceDescriptor`의 `features` 필드를 사용하면 원하는 추가 기능을 지정할 수 있습니다. 이 간단한 예제에서는 추가 기능을 사용하지 않기로 했습니다.

<div class="note">

사용하는 그래픽 카드가 사용할 수 있는 기능을 제한합니다. 특정 기능을 사용하려면 지원하는 장치를 제한하거나 대체 방법을 제공해야 할 수 있습니다.

`adapter.features()` 또는 `device.features()`를 사용하여 장치에서 지원하는 기능 목록을 얻을 수 있습니다.

전체 기능 목록은 [여기](https://docs.rs/wgpu/latest/wgpu/struct.Features.html)에서 볼 수 있습니다.

</div>

`limits` 필드는 우리가 생성할 수 있는 특정 유형의 리소스 한계를 설명합니다. 이 튜토리얼에서는 대부분의 장치를 지원하기 위해 기본값을 사용합니다. 제한 목록은 [여기](https://docs.rs/wgpu/latest/wgpu/struct.Limits.html)에서 볼 수 있습니다.

`memory_hints` 필드는 지원되는 경우 어댑터에 선호하는 메모리 할당 전략을 제공합니다. 사용 가능한 옵션은 [여기](https://wgpu.rs/doc/wgpu/enum.MemoryHints.html)에서 볼 수 있습니다.

```rust
        let surface_caps = surface.get_capabilities(&adapter);
        // 이 튜토리얼의 셰이더 코드는 sRGB 표면 텍스처를 가정합니다. 다른 것을 사용하면
        // 모든 색상이 더 어둡게 나옵니다. 비 sRGB 표면을 지원하려면
        // 프레임에 그릴 때 이를 고려해야 합니다.
        let surface_format = surface_caps.formats.iter()
            .find(|f| f.is_srgb())
            .copied()
            .unwrap_or(surface_caps.formats[0]);
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width: size.width,
            height: size.height,
            present_mode: surface_caps.present_modes[0],
            alpha_mode: surface_caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
```

여기서는 우리 `surface`에 대한 구성을 정의하고 있습니다. 이는 `surface`가 내부의 `SurfaceTexture`를 어떻게 생성할지 정의합니다. `SurfaceTexture`에 대해서는 `render` 함수에서 다룰 것입니다. 지금은 `config`의 필드에 대해 이야기해 봅시다.

`usage` 필드는 `SurfaceTexture`가 어떻게 사용될지를 설명합니다. `RENDER_ATTACHMENT`는 화면에 쓰기 위해 텍스처를 사용한다는 것을 명시합니다 (더 많은 `TextureUsages`에 대해서는 나중에 다룰 것입니다).

`format`은 `SurfaceTexture`가 GPU에 어떻게 저장될지를 정의합니다. `SurfaceCapabilities`에서 지원되는 포맷을 얻을 수 있습니다.

`width`와 `height`는 `SurfaceTexture`의 너비와 높이(픽셀 단위)입니다. 이것은 보통 창의 너비와 높이여야 합니다.

<div class="warning">

`SurfaceTexture`의 너비와 높이가 0이 아닌지 확인하세요. 0이면 앱이 충돌할 수 있습니다.

</div>

`present_mode`는 `wgpu::PresentMode` 열거형을 사용하며, 이는 표면을 디스플레이와 동기화하는 방법을 결정합니다. 단순화를 위해 사용 가능한 첫 번째 옵션을 선택합니다. 런타임 선택을 원하지 않는 경우, `PresentMode::Fifo`는 디스플레이의 프레임 속도로 디스플레이 속도를 제한합니다. 이것은 본질적으로 VSync입니다. 이 모드는 모든 플랫폼에서 지원이 보장됩니다. 다른 옵션들도 있으며, 모든 옵션은 [문서](https://docs.rs/wgpu/latest/wgpu/enum.PresentMode.html)에서 볼 수 있습니다.

<div class="note">

사용자가 사용할 `PresentMode`를 선택하게 하려면 [SurfaceCapabilities::present_modes](https://docs.rs/wgpu/latest/wgpu/struct.SurfaceCapabilities.html#structfield.present_modes)를 사용하여 surface가 지원하는 모든 `PresentMode` 목록을 얻을 수 있습니다:

```rust
let modes = &surface_caps.present_modes;
```

어떤 경우든 `PresentMode::Fifo`는 항상 지원되며, `PresentMode::AutoVsync`와 `PresentMode::AutoNoVsync`는 폴백 지원이 있어 모든 플랫폼에서 작동합니다.

</div>

솔직히 `alpha_mode`는 저도 익숙하지 않은 부분입니다. 투명한 창과 관련이 있는 것 같지만, 언제든지 풀 리퀘스트를 열어주세요. 지금은 `surface_caps`가 제공하는 목록의 첫 번째 `AlphaMode`를 사용하겠습니다.

`view_formats`는 `TextureView`를 생성할 때 사용할 수 있는 `TextureFormat` 목록입니다 (이 튜토리얼 후반부에서 간단히 다루고 [텍스처 튜토리얼](../tutorial5-textures)에서 더 깊이 다룰 것입니다). 글을 쓰는 시점에서 이것은 surface가 sRGB 색 공간인 경우, 선형 색 공간을 사용하는 텍스처 뷰를 생성할 수 있다는 것을 의미합니다.

이제 surface를 올바르게 구성했으므로, 메서드 끝에 이 새로운 필드들을 추가할 수 있습니다. `is_surface_configured` 필드는 나중에 사용될 것입니다.

```rust
    async fn new(window: Arc<Window>) -> anyhow::Result<State> {
        // ...

        Ok(Self {
            surface,
            device,
            queue,
            config,
            is_surface_configured: false, // 이 줄이 중복되었습니다. 하나는 삭제해야 합니다.
            window,
        })
    }
```

## resize()

애플리케이션에서 크기 조절을 지원하려면 창 크기가 변경될 때마다 `surface`를 재구성해야 합니다. 이것이 우리가 물리적 `size`와 `surface`를 구성하는 데 사용된 `config`를 저장한 이유입니다. 이 모든 것을 가지고 resize 메서드는 매우 간단합니다.

```rust
// impl State
pub fn resize(&mut self, width: u32, height: u32) {
    if width > 0 && height > 0 {
        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);
        self.is_surface_configured = true;
    }
}
```

여기서 `surface`를 구성합니다. `surface`를 사용하기 전에 구성해야 합니다. 여기서 `is_surface_configured` 플래그를 true로 설정하고 `render()` 함수에서 확인할 것입니다.

## handle_key()

여기서 키보드 이벤트를 처리할 것입니다. 현재는 Escape 키를 누르면 앱을 종료하기만 원합니다. 나중에 다른 작업을 추가할 것입니다.

```rust
// impl State
fn handle_key(&self, event_loop: &ActiveEventLoop, code: KeyCode, is_pressed: bool) {
    match (code, is_pressed) {
        (KeyCode::Escape, true) => event_loop.exit(),
        _ => {}
    }
}
```

`App`의 `window_event()` 함수에서 새로운 `handle_key()` 함수를 호출해야 합니다.

```rust
impl ApplicationHandler<State> for App {
    // ...

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: winit::window::WindowId,
        event: WindowEvent,
    ) {
        let state = match &mut self.state {
            Some(canvas) => canvas,
            None => return,
        };

        match event {
            // ...
            WindowEvent::KeyboardInput {
                event:
                    KeyEvent {
                        physical_key: PhysicalKey::Code(code),
                        state: key_state,
                        ..
                    },
                ..
            } => state.handle_key(event_loop, code, key_state.is_pressed()),
            _ => {}
        }
    }
}
```

## update()

아직 업데이트할 것이 없으므로 메서드를 비워 둡니다.

```rust
fn update(&mut self) {
    // `todo!()` 제거
}
```

나중에 객체를 움직이기 위해 여기에 코드를 추가할 것입니다.

## render()

마법이 일어나는 곳입니다. 먼저, 렌더링할 프레임을 가져와야 합니다.

```rust
// impl State

fn render(&mut self) -> Result<(), wgpu::SurfaceError> {
    self.window.request_redraw();

    // surface가 구성되지 않으면 렌더링할 수 없습니다.
    if !self.is_surface_configured {
        return Ok(());
    }
        
    let output = self.surface.get_current_texture()?;
```

`get_current_texture` 함수는 `surface`가 우리가 렌더링할 새로운 `SurfaceTexture`를 제공할 때까지 기다립니다. 이것을 나중을 위해 `output`에 저장할 것입니다.

```rust
    let view = output.texture.create_view(&wgpu::TextureViewDescriptor::default());
```

이 줄은 기본 설정으로 `TextureView`를 생성합니다. 렌더 코드가 텍스처와 상호 작용하는 방식을 제어하고 싶기 때문에 이 작업을 해야 합니다.

또한 GPU로 보낼 실제 명령을 생성하기 위해 `CommandEncoder`를 만들어야 합니다. 대부분의 최신 그래픽 프레임워크는 명령이 GPU로 전송되기 전에 커맨드 버퍼에 저장될 것을 기대합니다. `encoder`는 우리가 GPU로 보낼 수 있는 커맨드 버퍼를 빌드합니다.

```rust
    let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("Render Encoder"),
    });
```

이제 화면을 지우는 작업(오래 기다렸습니다)을 할 수 있습니다. `encoder`를 사용하여 `RenderPass`를 만들어야 합니다. `RenderPass`는 실제 그리기를 위한 모든 메서드를 가지고 있습니다. `RenderPass`를 만드는 코드는 약간 중첩되어 있으므로, 그 부분에 대해 이야기하기 전에 전체 코드를 여기에 복사하겠습니다.

```rust
    {
        let _render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("Render Pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color {
                        r: 0.1,
                        g: 0.2,
                        b: 0.3,
                        a: 1.0,
                    }),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            occlusion_query_set: None,
            timestamp_writes: None,
        });
    }

    // submit은 IntoIter를 구현하는 모든 것을 허용합니다.
    self.queue.submit(std::iter::once(encoder.finish()));
    output.present();

    Ok(())
}
```

먼저, `encoder.begin_render_pass(...)`를 감싸는 추가 블록(`{}`)에 대해 이야기해 봅시다. `begin_render_pass()`는 `encoder`를 가변적으로(mutably, 즉 `&mut self`) 빌려옵니다. 이 가변적인 빌림을 해제하기 전까지는 `encoder.finish()`를 호출할 수 없습니다. 이 블록은 Rust에게 해당 스코프를 벗어날 때 그 안의 모든 변수를 드롭(drop)하도록 지시하여, `encoder`에 대한 가변적인 빌림을 해제하고 `finish()`를 호출할 수 있게 해줍니다. `{}`가 마음에 들지 않으면 `drop(render_pass)`를 사용하여 동일한 효과를 얻을 수도 있습니다.

코드의 마지막 줄은 `wgpu`에게 커맨드 버퍼를 마무리하고 GPU의 렌더 큐에 제출하라고 지시합니다.

이 메서드를 호출하기 위해 이벤트 루프를 다시 업데이트해야 합니다. 그 전에 `update()`도 호출할 것입니다.

```rust
// run()
    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: winit::window::WindowId,
        event: WindowEvent,
    ) {
        let state = match &mut self.state {
            Some(canvas) => canvas,
            None => return,
        };

        match event {
            // ...
            WindowEvent::RedrawRequested => {
                match state.render() {
                    Ok(_) => {}
                    // surface가 손실되거나 오래된 경우 재구성합니다.
                    Err(wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated) => {
                        let size = state.window.inner_size();
                        state.resize(size.width, size.height);
                    }
                    Err(e) => {
                        log::error!("Unable to render {}", e);
                    }
                }
            }
            // ...
        }
    }
```

이 모든 것을 마치면 다음과 같은 화면이 나타나야 합니다.

![파란 배경의 창](./cleared-window.png)

## 잠깐, RenderPassDescriptor는 대체 무엇일까요?

여러분 중 일부는 보기만 해도 무슨 일인지 알 수 있겠지만, 제가 설명하지 않고 넘어가면 직무유기일 것입니다. 코드를 다시 한번 살펴봅시다.

```rust
&wgpu::RenderPassDescriptor {
    label: Some("Render Pass"),
    color_attachments: &[
        // ...
    ],
    depth_stencil_attachment: None,
}
```

`RenderPassDescriptor`에는 `label`, `color_attachments`, `depth_stencil_attachment` 세 개의 필드만 있습니다. `color_attachments`는 우리가 색상을 그릴 위치를 설명합니다. 화면에 렌더링되도록 하기 위해 이전에 만든 `TextureView`를 사용합니다.

<div class="note">

`color_attachments` 필드는 "희소 배열(sparse array)"입니다. 이를 통해 여러 렌더 타겟을 예상하는 파이프라인을 사용하면서 신경 쓰는 타겟만 제공할 수 있습니다.

</div>

`depth_stencil_attachment`는 나중에 사용하겠지만, 지금은 `None`으로 설정합니다.

```rust
Some(wgpu::RenderPassColorAttachment {
    view: &view,
    resolve_target: None,
    ops: wgpu::Operations {
        load: wgpu::LoadOp::Clear(wgpu::Color {
            r: 0.1,
            g: 0.2,
            b: 0.3,
            a: 1.0,
        }),
        store: wgpu::StoreOp::Store,
    },
})
```

`RenderPassColorAttachment`에는 `view` 필드가 있으며, 이는 `wgpu`에게 색상을 저장할 텍스처를 알려줍니다. 이 경우, `surface.get_current_texture()`를 사용하여 만든 `view`를 지정합니다. 이것은 이 어태치먼트에 그리는 모든 색상이 화면에 그려진다는 것을 의미합니다.

`resolve_target`은 해석된(resolved) 출력을 받을 텍스처입니다. 멀티샘플링이 활성화되지 않은 경우 `view`와 동일합니다. 이것을 지정할 필요가 없으므로 `None`으로 둡니다.

`ops` 필드는 `wgpu::Operations` 객체를 받습니다. 이것은 wgpu에게 화면의 색상(`view`로 지정됨)으로 무엇을 할지 지시합니다. `load` 필드는 이전 프레임에서 저장된 색상을 어떻게 처리할지 wgpu에 지시합니다. 현재는 화면을 푸른색 계열의 색상으로 지우고 있습니다. `store` 필드는 렌더링된 결과를 `TextureView` 뒤의 `Texture`에 저장할지 여부를 wgpu에 지시합니다 (이 경우, `SurfaceTexture`입니다). 렌더링 결과를 저장하고 싶으므로 `StoreOp::Store`를 사용합니다.

<div class="note">

화면이 객체들로 완전히 덮일 예정이라면 화면을 지우지 않는 것이 드물지 않습니다. 그러나 씬(scene)이 화면 전체를 덮지 않는다면, 다음과 같은 결과가 나올 수 있습니다.

![./no-clear.png](./no-clear.png)

</div>

## 유효성 검사 오류(Validation Errors)?

머신에서 wgpu가 Vulkan을 사용하고 있다면, 오래된 버전의 Vulkan SDK를 실행 중일 경우 유효성 검사 오류가 발생할 수 있습니다. 최소 `1.2.182` 버전 이상을 사용해야 합니다. 이전 버전은 일부 거짓 양성(false positives)을 일으킬 수 있습니다. 오류가 계속되면 wgpu에 버그가 있을 수 있습니다. [https://github.com/gfx-rs/wgpu](https://github.com/gfx-rs/wgpu)에 이슈를 게시할 수 있습니다.

## 데모

<WasmExample example="tutorial2_surface"></WasmExample>

<AutoGithubLink/>

## 도전 과제

마우스 이벤트를 캡처하고 그것을 사용하여 배경색(clear color)을 업데이트하도록 `input()` 메서드를 수정하세요. *힌트: 아마도 `WindowEvent::CursorMoved`를 사용해야 할 것입니다*.
