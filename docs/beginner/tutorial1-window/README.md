# 의존성과 윈도우

## 지루한 거 알아요

이 글을 읽는 분들 중에는 이미 Rust로 윈도우를 띄우는 데 매우 익숙하고, 선호하는 윈도우 라이브러리가 있을 겁니다. 하지만 이 가이드는 모두를 위해 작성되었으므로, 반드시 다루어야 할 내용입니다. 다행히, 이미 잘 알고 계신다면 이 부분은 읽지 않아도 됩니다. 하지만 한 가지 알아두셔야 할 점은, 어떤 윈도우 솔루션을 사용하든 [`raw-window-handle`](https://github.com/rust-windowing/raw-window-handle) 크레이트를 지원해야 한다는 것입니다.

## 어떤 크레이트를 사용하나요?

초보자들을 위한 내용에서는 아주 간단하게 유지할 것입니다. 진행하면서 필요한 것들을 추가하겠지만, 아래에 관련 `Cargo.toml` 내용을 나열했습니다.

```toml
[dependencies]
winit = { version = "0.30", features = ["android-native-activity"] }
env_logger = "0.10"
log = "0.4"
wgpu = "25.0"
```

## Rust의 새로운 리졸버 사용하기

wgpu 0.10 버전부터 Cargo의 [최신 기능 리졸버(feature resolver)](https://doc.rust-lang.org/cargo/reference/resolver.html#feature-resolver-version-2)가 필요합니다. 이 리졸버는 2021 에디션(Rust 1.56.0 버전 이상에서 `cargo new`로 생성한 새 프로젝트)의 기본값입니다. 하지만 만약 2018 에디션을 사용하고 있다면, 단일 크레이트 작업 시에는 `Cargo.toml`의 `[package]` 섹션에, 워크스페이스(workspace) 작업 시에는 루트 `Cargo.toml`의 `[workspace]` 섹션에 `resolver = "2"`를 반드시 포함해야 합니다.

## env_logger

`env_logger::init();`을 통해 로깅을 활성화하는 것은 매우 중요합니다.
`wgpu`는 오류가 발생하면 일반적인 메시지와 함께 패닉(panic)을 일으키고, 실제 오류는 `log` 크레이트를 통해 기록합니다.
즉, `env_logger::init()`을 포함하지 않으면 `wgpu`는 조용히 실패하여 여러분을 매우 혼란스럽게 만들 것입니다!
(아래 코드에서는 이미 이 작업이 수행되었습니다)

## 새 프로젝트 생성하기

`cargo new project_name`을 실행하세요. 여기서 `project_name`은 프로젝트의 이름입니다.
(아래 예제에서는 'tutorial1_window'를 사용했습니다)

## 코드

모든 상태(state)를 저장할 공간이 필요하므로 `State` 구조체를 만들어 보겠습니다.

```rust
use std::sync::Arc;

use winit::{
    application::ApplicationHandler, event::*, event_loop::{ActiveEventLoop, EventLoop}, keyboard::{KeyCode, PhysicalKey}, window::Window
};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

// 이 구조체는 게임의 상태를 저장합니다
pub struct State {
    window: Arc<Window>,
}

impl State {
    // 지금 당장은 비동기(async)일 필요가 없지만,
    // 다음 튜토리얼에서 필요해집니다
    pub async fn new(window: Arc<Window>) -> anyhow::Result<Self> {
        Ok(Self {
            window,
        })
    }

    pub fn resize(&mut self, _width: u32, _height: u32) {
        // 다음 튜토리얼에서 여기를 채울 겁니다
    }
    
    pub fn render(&mut self) {
        self.window.request_redraw();

        // 다음 튜토리얼에서 여기에 더 많은 작업을 추가할 겁니다
    }
}

// ...
```

아직은 별 내용이 없지만, WGPU를 사용하기 시작하면 이 구조체는 금방 채워질 것입니다. 이 구조체의 대부분 메서드는 아직 비어있지만, `render()`에서는 윈도우가 가능한 한 빨리 다음 프레임을 그리도록 요청합니다. `winit`은 윈도우 크기가 조절되거나 다음 프레임을 그리도록 요청하지 않는 한 한 프레임만 그리기 때문입니다.

이제 `State` 구조체가 생겼으니, `winit`에게 이 구조체를 어떻게 사용할지 알려줘야 합니다. 이를 위해 `App` 구조체를 만들겠습니다.

```rust
pub struct App {
    #[cfg(target_arch = "wasm32")]
    proxy: Option<winit::event_loop::EventLoopProxy<State>>,
    state: Option<State>,
}

impl App {
    pub fn new(#[cfg(target_arch = "wasm32")] event_loop: &EventLoop<State>) -> Self {
        #[cfg(target_arch = "wasm32")]
        let proxy = Some(event_loop.create_proxy());
        Self {
            state: None,
            #[cfg(target_arch = "wasm32")]
            proxy,
        }
    }
}
```

`App` 구조체에는 `state`와 `proxy` 두 개의 필드가 있습니다.

`state` 변수는 `State` 구조체를 `Option`으로 저장합니다. `Option`이 필요한 이유는 `State::new()`가 윈도우를 필요로 하고, 윈도우는 애플리케이션이 `Resumed` 상태가 될 때까지 생성할 수 없기 때문입니다. 이 부분은 잠시 후에 더 자세히 다루겠습니다.

`proxy` 변수는 웹 환경에서만 필요합니다. 그 이유는 WGPU 리소스를 생성하는 과정이 비동기(async) 프로세스이기 때문입니다. 이 또한 잠시 후에 다루겠습니다.

이제 `App` 구조체가 있으니 `ApplicationHandler` 트레이트를 구현해야 합니다. 이 트레이트는 키보드 입력, 마우스 움직임, 그리고 다양한 생명주기 이벤트와 같은 애플리케이션 이벤트를 받을 수 있는 여러 함수를 제공합니다. 먼저 `resumed`와 `user_event` 메서드부터 살펴보겠습니다.

```rust
impl ApplicationHandler<State> for App {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        #[allow(unused_mut)]
        let mut window_attributes = Window::default_attributes();

        #[cfg(target_arch = "wasm32")]
        {
            use wasm_bindgen::JsCast;
            use winit::platform::web::WindowAttributesExtWebSys;
            
            const CANVAS_ID: &str = "canvas";

            let window = wgpu::web_sys::window().unwrap_throw();
            let document = window.document().unwrap_throw();
            let canvas = document.get_element_by_id(CANVAS_ID).unwrap_throw();
            let html_canvas_element = canvas.unchecked_into();
            window_attributes = window_attributes.with_canvas(Some(html_canvas_element));
        }

        let window = Arc::new(event_loop.create_window(window_attributes).unwrap());

        #[cfg(not(target_arch = "wasm32"))]
        {
            // 웹 환경이 아니라면 pollster를 사용하여
            // future를 동기적으로 기다릴 수 있습니다
            self.state = Some(pollster::block_on(State::new(window)).unwrap());
        }

        #[cfg(target_arch = "wasm32")]
        {
            // future를 비동기적으로 실행하고
            // proxy를 사용해 결과를 이벤트 루프로 보냅니다
            if let Some(proxy) = self.proxy.take() {
                wasm_bindgen_futures::spawn_local(async move {
                    assert!(proxy
                        .send_event(
                            State::new(window)
                                .await
                                .expect("Unable to create canvas!!!")
                        )
                        .is_ok())
                });
            }
        }
    }

    #[allow(unused_mut)]
    fn user_event(&mut self, _event_loop: &ActiveEventLoop, mut event: State) {
        // proxy.send_event()가 보낸 이벤트가 여기로 도착합니다
        #[cfg(target_arch = "wasm32")]
        {
            event.window.request_redraw();
            event.resize(
                event.window.inner_size().width,
                event.window.inner_size().height,
            );
        }
        self.state = Some(event);
    }

    // ...
}
```

`resumed` 메서드는 많은 일을 하는 것처럼 보이지만, 실제로는 몇 가지 작업만 수행합니다:

- 일부 웹 특정 내용을 포함한 윈도우 속성을 정의합니다.
- 이 속성들을 사용하여 윈도우를 생성합니다.
- `State` 구조체를 생성하는 future를 만듭니다.
- 네이티브(native) 환경에서는 `pollster`를 사용해 future를 기다립니다(await).
- 웹(web) 환경에서는 future를 비동기적으로 실행하고 그 결과를 `user_event` 함수로 보냅니다.

`user_event` 함수는 `State` future의 결과가 도착하는 지점 역할을 합니다. `resumed`는 비동기 함수가 아니므로 future 작업을 다른 곳으로 보내고 그 결과를 받을 장소가 필요합니다.

다음으로 `window_event`에 대해 이야기해 보겠습니다.

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
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::Resized(size) => state.resize(size.width, size.height),
            WindowEvent::RedrawRequested => {
                state.render();
            }
            WindowEvent::KeyboardInput {
                event:
                    KeyEvent {
                        physical_key: PhysicalKey::Code(code),
                        state,
                        ..
                    },
                ..
            } => match (code, state.is_pressed()) {
                (KeyCode::Escape, true) => event_loop.exit(),
                _ => {}
            },
            _ => {}
        }
    }
}
```

이곳에서 키보드 입력, 마우스 움직임 같은 이벤트와 더불어, 윈도우가 그리기를 원하거나 크기가 조절될 때와 같은 다른 윈도우 이벤트를 처리할 수 있습니다. `State`에 정의했던 메서드들을 여기서 호출할 수 있습니다.

이제 실제로 코드를 실행해야 합니다. 이를 위해 `run()` 함수를 만들겠습니다.

```rust
pub fn run() -> anyhow::Result<()> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        env_logger::init();
    }
    #[cfg(target_arch = "wasm32")]
    {
        console_log::init_with_level(log::Level::Info).unwrap_throw();
    }

    let event_loop = EventLoop::with_user_event().build()?;
    let mut app = App::new(
        #[cfg(target_arch = "wasm32")]
        &event_loop,
    );
    event_loop.run_app(&mut app)?;

    Ok(())
}
```

이 함수는 로거를 설정하고, `event_loop`와 `app`을 생성한 다음, `app`을 끝까지 실행합니다.

## 웹 지원 추가

우리 앱을 웹에서 실행하기 위해 `Cargo.toml`을 일부 변경해야 합니다.

```toml
[lib]
crate-type = ["cdylib", "rlib"]
```

이 라인들은 Cargo에게 우리 크레이트가 네이티브 Rust 정적 라이브러리(`rlib`)와 C/C++ 호환 라이브러리(`cdylib`)를 빌드할 수 있도록 지시합니다. 데스크톱 환경에서 wgpu를 실행하려면 `rlib`이 필요하고, 브라우저가 실행할 WebAssembly를 만들려면 `cdylib`이 필요합니다.

<div class="note">

## WebAssembly

WebAssembly, 즉 WASM은 대부분의 최신 브라우저에서 지원하는 바이너리 형식으로, Rust와 같은 저수준 언어가 웹 페이지에서 실행될 수 있게 해줍니다. 이를 통해 우리는 애플리케이션의 대부분을 Rust로 작성하고, 몇 줄의 자바스크립트만으로 웹 브라우저에서 실행할 수 있습니다.

</div>

이제 WASM에서 실행하는 데 특화된 몇 가지 의존성을 추가해야 합니다.

```toml
# 이 부분은 루트 디렉토리의 Cargo.toml에 추가되어야 합니다
[profile.release]
strip = true

[dependencies]
# ... 다른 일반 의존성들

[target.'cfg(target_arch = "wasm32")'.dependencies]
console_error_panic_hook = "0.1.6"
console_log = "1.0"
wgpu = { version = "25.0", features = ["webgl"]}
wasm-bindgen = "0.2"
wasm-bindgen-futures = "0.4.30"
web-sys = { version = "0.3", features = [
    "Document",
    "Window",
    "Element",
]}
```

`[target.'cfg(target_arch = "wasm32")'.dependencies]` 라인은 Cargo에게 `wasm32` 아키텍처를 타겟으로 할 때만 이 의존성들을 포함하도록 지시합니다. 다음 몇 가지 의존성들은 자바스크립트와의 연동을 훨씬 쉽게 만들어 줍니다.

- [`console_error_panic_hook`](https://docs.rs/console_error_panic_hook)은 `panic!` 매크로가 자바스크립트 콘솔로 오류를 보내도록 설정합니다. 이것이 없으면 패닉이 발생했을 때 원인을 알 수 없어 막막해집니다.
- [`console_log`](https://docs.rs/console_log)는 [`log`](https://docs.rs/log) API를 구현합니다. 모든 로그를 자바스크립트 콘솔로 보내며, 특정 로그 레벨의 로그만 보내도록 설정할 수 있습니다. 이 또한 디버깅에 매우 유용합니다.
- 현재 대부분의 브라우저에서 실행하려면 wgpu의 `webgl` 기능을 활성화해야 합니다. WebGPU API를 직접 사용하는 지원 작업이 진행 중이지만, 이는 Firefox Nightly나 Chrome Canary 같은 실험적인 브라우저 버전에서만 가능합니다.<br>
  이 코드를 해당 브라우저들에서 테스트해 보셔도 좋습니다(wgpu 개발자들도 고마워할 것입니다). 하지만 단순함을 위해, WebGPU API가 더 안정될 때까지는 `webgl` 기능을 사용하는 것으로 하겠습니다.<br>
  더 자세한 내용은 [wgpu 저장소의 웹 컴파일 가이드](https://github.com/gfx-rs/wgpu/wiki/Running-on-the-Web-with-WebGPU-and-WebGL)를 확인하세요.
- [`wasm-bindgen`](https://docs.rs/wasm-bindgen)은 이 목록에서 가장 중요한 의존성입니다. 브라우저에게 우리 크레이트를 어떻게 사용해야 하는지 알려주는 상용구 코드를 생성하는 역할을 합니다. 또한 Rust의 메서드를 자바스크립트에서 사용할 수 있게 하고, 그 반대도 가능하게 해줍니다.<br>
  wasm-bindgen의 세부 사항까지 다루지는 않으므로, 입문이나 복습이 필요하다면 [이 문서](https://rustwasm.github.io/wasm-bindgen/)를 확인하세요.
- [`web-sys`](https://docs.rs/web-sys)는 일반적인 자바스크립트 애플리케이션에서 사용할 수 있는 `get_element_by_id`, `append_child`와 같은 많은 메서드와 구조체를 포함하는 크레이트입니다. 나열된 기능들은 현재 우리에게 필요한 최소한의 기능입니다.

## 추가 코드

웹에서 우리 코드를 실행할 함수를 만들어 봅시다.

```rust
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(start)]
pub fn run_web() -> Result<(), wasm_bindgen::JsValue> {
    console_error_panic_hook::set_once();
    run().unwrap_throw();

    Ok(())
}
```

이 함수는 `console_error_panic_hook`을 설정하여 코드가 패닉을 일으킬 때 브라우저 콘솔에서 볼 수 있게 합니다. 또한 다른 `run()` 함수를 호출합니다.

## Wasm-pack

`wasm-bindgen`만으로도 wgpu 애플리케이션을 빌드할 수 있지만, 그렇게 하면서 몇 가지 문제에 부딪혔습니다. 우선, `wasm-bindgen`을 컴퓨터에 설치하고 의존성으로도 포함해야 합니다. 의존성으로 설치하는 버전은 컴퓨터에 설치된 버전과 **정확히** 일치해야 합니다. 그렇지 않으면 빌드가 실패합니다.

이 단점을 해결하고 이 글을 읽는 모든 분들의 수고를 덜기 위해, [`wasm-pack`](https://rustwasm.github.io/docs/wasm-pack/)을 추가하기로 결정했습니다. Wasm-pack은 올바른 버전의 `wasm-bindgen`을 설치해 주며, 브라우저, NodeJS, 그리고 webpack과 같은 번들러 등 다양한 웹 타겟을 위한 빌드를 지원합니다.

wasm-pack을 사용하려면, 먼저 [설치](https://rustwasm.github.io/wasm-pack/installer/)해야 합니다.

설치가 끝나면 크레이트를 빌드하는 데 사용할 수 있습니다. 프로젝트에 크레이트가 하나뿐이라면 `wasm-pack build`를 사용하면 됩니다. 워크스페이스를 사용하는 경우, 빌드할 크레이트를 지정해야 합니다. 크레이트가 `game`이라는 디렉토리에 있다면 다음과 같이 사용합니다.

```bash
wasm-pack build game
```

wasm-pack 빌드가 끝나면, 크레이트와 같은 디렉토리에 `pkg` 디렉토리가 생성됩니다. 여기에는 WASM 코드를 실행하는 데 필요한 모든 자바스크립트 코드가 들어있습니다. 자바스크립트에서 WASM 모듈을 다음과 같이 가져옵니다.

```js
const init = await import('./pkg/game.js');
init().then(() => console.log("WASM Loaded"));
```

이 사이트는 [Vuepress](https://vuepress.vuejs.org/)를 사용하므로, Vue 컴포넌트에서 WASM을 로드합니다. WASM을 어떻게 다룰지는 여러분이 무엇을 하고 싶은지에 따라 달라집니다. 제가 어떻게 하고 있는지 확인하고 싶다면, [이 링크](https://github.com/sotrh/learn-wgpu/blob/master/docs/.vuepress/components/WasmExample.vue)를 살펴보세요.

<div class="note">

만약 일반 HTML 웹사이트에서 WASM 모듈을 사용하려 한다면, wasm-pack에게 웹을 타겟으로 하라고 알려줘야 합니다.

```bash
wasm-pack build --target web
```

그런 다음 ES6 모듈에서 WASM 코드를 실행해야 합니다.

```html
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Learn WGPU</title>
    <style>
        canvas {
            background-color: black;
        }
    </style>
</head>

<body id="wasm-example">
  <script type="module">
      import init from "./pkg/pong.js";
      init().then(() => {
          console.log("WASM Loaded");
      });
  </script>
</body>

</html>
```

</div>

## 데모

아래 버튼을 누르면 코드가 실행되는 것을 볼 수 있습니다!

<WasmExample example="tutorial1_window"></WasmExample>

<AutoGithubLink/>
