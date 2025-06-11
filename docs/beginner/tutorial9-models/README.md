# 모델 로딩

지금까지 우리는 모델을 수동으로 만들어왔습니다. 이 방법도 괜찮지만, 폴리곤이 많은 복잡한 모델을 포함시키고 싶을 때는 정말 느립니다. 이러한 이유로, 이제 코드를 수정하여 `.obj` 모델 형식을 활용함으로써 Blender와 같은 소프트웨어에서 모델을 만들어 코드에 표시할 수 있도록 할 것입니다.

`lib.rs` 파일이 꽤 복잡해지고 있습니다. 모델 로딩 코드를 넣을 수 있도록 `model.rs` 파일을 만들어 보겠습니다.

```rust
// model.rs
pub trait Vertex {
    fn desc() -> wgpu::VertexBufferLayout<'static>;
}

#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct ModelVertex {
    pub position: [f32; 3],
    pub tex_coords: [f32; 2],
    pub normal: [f32; 3],
}

impl Vertex for ModelVertex {
    fn desc() -> wgpu::VertexBufferLayout<'static> {
        todo!();
    }
}
```

여기서 몇 가지를 발견할 수 있습니다. `lib.rs`에서는 `Vertex`를 구조체(struct)로 사용했지만, 여기서는 트레이트(trait)를 사용하고 있습니다. 우리는 여러 버텍스 타입(모델, UI, 인스턴스 데이터 등)을 가질 수 있습니다. `Vertex`를 트레이트로 만들면 `VertexBufferLayout` 생성 코드를 추상화하여 `RenderPipeline`을 더 간단하게 만들 수 있습니다.

또 다른 점은 `ModelVertex`의 `normal` 필드입니다. 이 필드는 조명에 대해 이야기할 때까지 사용하지 않겠지만, 지금은 구조체에 추가해 두겠습니다.

이제 `VertexBufferLayout`을 정의해 봅시다.

```rust
impl Vertex for ModelVertex {
    fn desc() -> wgpu::VertexBufferLayout<'static> {
        use std::mem;
        wgpu::VertexBufferLayout {
            array_stride: mem::size_of::<ModelVertex>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[
                wgpu::VertexAttribute {
                    offset: 0,
                    shader_location: 0,
                    format: wgpu::VertexFormat::Float32x3,
                },
                wgpu::VertexAttribute {
                    offset: mem::size_of::<[f32; 3]>() as wgpu::BufferAddress,
                    shader_location: 1,
                    format: wgpu::VertexFormat::Float32x2,
                },
                wgpu::VertexAttribute {
                    offset: mem::size_of::<[f32; 5]>() as wgpu::BufferAddress,
                    shader_location: 2,
                    format: wgpu::VertexFormat::Float32x3,
                },
            ],
        }
    }
}
```

이 코드는 기본적으로 원래의 `VertexBufferLayout`과 동일하지만, `normal`을 위한 `VertexAttribute`를 추가했습니다. `lib.rs`에 있던 `Vertex` 구조체는 더 이상 필요 없으므로 삭제하고, `RenderPipeline`을 위해 `model`의 새로운 `Vertex`를 사용하세요.

또한, 직접 만들었던 `vertex_buffer`, `index_buffer`, `num_indices`도 제거할 것입니다.

```rust
let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
    // ...
    vertex: wgpu::VertexState {
        // ...
        buffers: &[model::ModelVertex::desc(), InstanceRaw::desc()],
    },
    // ...
});
```

`desc` 메서드는 `Vertex` 트레이트에 구현되어 있으므로, 이 메서드에 접근하려면 먼저 트레이트를 가져와야(import) 합니다. 파일 상단의 다른 `use`문과 함께 추가해주세요.

```rust
use model::Vertex;
```

이 모든 것이 준비되었으니, 이제 렌더링할 모델이 필요합니다. 이미 가지고 있다면 좋지만, 없다면 모델과 모든 텍스처가 포함된 [zip 파일](https://github.com/sotrh/learn-wgpu/blob/master/code/beginner/tutorial9-models/res/cube.zip)을 제공해 드립니다. 이 모델을 기존 `src` 폴더 옆에 새로운 `res` 폴더를 만들어 그 안에 넣을 것입니다.

## res 폴더의 파일에 접근하기

Cargo가 우리 프로그램을 빌드하고 실행할 때, 현재 작업 디렉토리(current working directory)라는 것을 설정합니다. 이 디렉토리에는 보통 프로젝트의 루트 `Cargo.toml`이 포함됩니다. `res` 폴더의 경로는 프로젝트 구조에 따라 달라질 수 있습니다. 이 튜토리얼의 예제 코드에서 `res` 폴더는 `code/beginner/tutorial9-models/res/`에 있습니다. 모델을 로드할 때 이 경로를 사용하고 `cube.obj`를 덧붙일 수 있습니다. 이것도 괜찮지만, 프로젝트 구조를 변경하면 코드가 깨질 것입니다.

이 문제를 해결하기 위해, 빌드 스크립트를 수정하여 Cargo가 실행 파일을 만드는 위치에 `res` 폴더를 복사하고, 거기서부터 참조하도록 할 것입니다. `build.rs`라는 파일을 만들고 다음을 추가하세요.

```rust
use anyhow::*;
use fs_extra::copy_items;
use fs_extra::dir::CopyOptions;
use std::env;

fn main() -> Result<()> {
    // 이 줄은 /res/ 폴더에 변경 사항이 있을 경우 Cargo에게 이 스크립트를 다시 실행하라고 알립니다.
    println!("cargo:rerun-if-changed=res/*");

    let out_dir = env::var("OUT_DIR")?;
    let mut copy_options = CopyOptions::new();
    copy_options.overwrite = true;
    let mut paths_to_copy = Vec::new();
    paths_to_copy.push("res/");
    copy_items(&paths_to_copy, out_dir, &copy_options)?;

    Ok(())
}
```

<div class="note">

`build.rs`를 `Cargo.toml`과 같은 폴더에 두어야 합니다. 그렇지 않으면 Cargo가 크레이트를 빌드할 때 실행하지 않습니다.

</div>

<div class="note">

`OUT_DIR`은 Cargo가 애플리케이션이 빌드될 위치를 지정하는 데 사용하는 환경 변수입니다.

</div>

이것이 제대로 작동하려면 `Cargo.toml`을 수정해야 합니다. `[dependencies]` 블록 아래에 다음을 추가하세요.

```toml
[build-dependencies]
anyhow = "1.0"
fs_extra = "1.2"
glob = "0.3"
```

## WASM에서 파일에 접근하기

설계상, 웹 어셈블리(Web Assembly)에서는 사용자 파일 시스템의 파일에 접근할 수 없습니다. 대신, 웹 서버를 사용해 해당 파일들을 제공하고 HTTP 요청을 통해 코드 안으로 로드할 것입니다. 이를 단순화하기 위해, 이 작업을 처리할 `resources.rs`라는 파일을 만들어 봅시다. 각각 텍스트 파일과 바이너리 파일을 로드하는 두 개의 함수를 만들 것입니다.

```rust
use std::io::{BufReader, Cursor};

use wgpu::util::DeviceExt;

use crate::{model, texture};

#[cfg(target_arch = "wasm32")]
fn format_url(file_name: &str) -> reqwest::Url {
    let window = web_sys::window().unwrap();
    let location = window.location();
    let mut origin = location.origin().unwrap();
    if !origin.ends_with("learn-wgpu") {
        origin = format!("{}/learn-wgpu", origin);
    }
    let base = reqwest::Url::parse(&format!("{}/", origin,)).unwrap();
    base.join(file_name).unwrap()
}

pub async fn load_string(file_name: &str) -> anyhow::Result<String> {
    #[cfg(target_arch = "wasm32")]
    let txt = {
        let url = format_url(file_name);
        reqwest::get(url).await?.text().await?
    };
    #[cfg(not(target_arch = "wasm32"))]
    let txt = {
        let path = std::path::Path::new(env!("OUT_DIR"))
            .join("res")
            .join(file_name);
        std::fs::read_to_string(path)?
    };

    Ok(txt)
}

pub async fn load_binary(file_name: &str) -> anyhow::Result<Vec<u8>> {
    #[cfg(target_arch = "wasm32")]
    let data = {
        let url = format_url(file_name);
        reqwest::get(url).await?.bytes().await?.to_vec()
    };
    #[cfg(not(target_arch = "wasm32"))]
    let data = {
        let path = std::path::Path::new(env!("OUT_DIR"))
            .join("res")
            .join(file_name);
        std::fs::read(path)?
    };

    Ok(data)
}
```

<div class="note">

데스크톱에서는 `OUT_DIR`을 사용하여 `res` 폴더에 접근하고 있습니다.

</div>

WASM 사용 시 요청을 처리하기 위해 [reqwest](https://docs.rs/reqwest)를 사용하고 있습니다. `Cargo.toml`에 다음을 추가하세요:

```toml
[target.'cfg(target_arch = "wasm32")'.dependencies]
# 다른 의존성들
reqwest = { version = "0.11" }
```

또한 `web-sys`에 `Location` 기능을 추가해야 합니다:

```toml
web-sys = { version = "0.3", features = [
    "Document",
    "Window",
    "Element",
    "Location",
]}
```

`lib.rs`에 `resources`를 모듈로 추가하는 것을 잊지 마세요:

```rust
mod resources;
```

## TOBJ로 모델 로딩하기

[tobj](https://docs.rs/tobj/3.0/tobj/) 라이브러리를 사용하여 모델을 로드할 것입니다. `Cargo.toml`에 추가해 봅시다.

```toml
[dependencies]
# 다른 의존성들...
tobj = { version = "3.2", default-features = false, features = ["async"]}
```

하지만 모델을 로드하기 전에, 그것을 담을 공간이 필요합니다.

```rust
// model.rs
pub struct Model {
    pub meshes: Vec<Mesh>,
    pub materials: Vec<Material>,
}
```

`Model` 구조체에는 `meshes`와 `materials`를 위한 `Vec`이 있습니다. 이는 `.obj` 파일이 여러 메쉬와 머티리얼을 포함할 수 있기 때문에 중요합니다. 아직 `Mesh`와 `Material` 클래스를 만들어야 하므로, 이제 그것들을 만들어 봅시다.

```rust
pub struct Material {
    pub name: String,
    pub diffuse_texture: texture::Texture,
    pub bind_group: wgpu::BindGroup,
}

pub struct Mesh {
    pub name: String,
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: wgpu::Buffer,
    pub num_elements: u32,
    pub material: usize,
}
```

`Material`은 꽤 간단합니다. 이름과 하나의 텍스처로 이루어져 있습니다. 우리의 큐브 obj는 실제로 두 개의 텍스처를 가지고 있지만, 하나는 노멀 맵이며, 그것은 [나중에](../../intermediate/tutorial11-normals) 다룰 것입니다. 이름은 주로 디버깅 목적으로 사용됩니다.

텍스처 이야기가 나왔으니, `resources.rs`에 `Texture`를 로드하는 함수를 추가해야 합니다.

```rust
pub async fn load_texture(
    file_name: &str,
    device: &wgpu::Device,
    queue: &wgpu::Queue,
) -> anyhow::Result<texture::Texture> {
    let data = load_binary(file_name).await?;
    texture::Texture::from_bytes(device, queue, &data, file_name)
}
```

`load_texture` 메서드는 모델의 텍스처를 로드할 때 유용할 것입니다. `include_bytes!`는 컴파일 타임에 파일 이름을 알아야 하는데, 모델 텍스처의 경우 이를 보장할 수 없기 때문입니다.

`Mesh`는 버텍스 버퍼, 인덱스 버퍼, 그리고 메쉬의 인덱스 수를 가지고 있습니다. 머티리얼에는 `usize`를 사용합니다. 이 `usize`는 그릴 때가 되면 `materials` 리스트의 인덱스로 사용될 것입니다.

이제 모든 준비가 끝났으니, 모델을 로드해 봅시다.

```rust
use std::io::{BufReader, Cursor};

pub async fn load_model(
    file_name: &str,
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    layout: &wgpu::BindGroupLayout,
) -> anyhow::Result<model::Model> {
    let obj_text = crate::resources::load_string(file_name).await?;
    let obj_cursor = Cursor::new(obj_text);
    let mut obj_reader = BufReader::new(obj_cursor);

    let (models, obj_materials) = tobj::load_obj_buf_async(
        &mut obj_reader,
        &tobj::LoadOptions {
            triangulate: true,
            single_index: true,
            ..Default::default()
        },
        |p| async move {
            let mat_text = crate::resources::load_string(&p).await.unwrap();
            tobj::load_mtl_buf(&mut BufReader::new(Cursor::new(mat_text)))
        },
    )
    .await?;

    let mut materials = Vec::new();
    for m in obj_materials? {
        let diffuse_texture =
            crate::resources::load_texture(&m.diffuse_texture.unwrap(), device, queue).await?;
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&diffuse_texture.view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&diffuse_texture.sampler),
                },
            ],
            label: None,
        });

        materials.push(model::Material {
            name: m.name,
            diffuse_texture,
            bind_group,
        })
    }

    let meshes = models
        .into_iter()
        .map(|m| {
            let vertices = (0..m.mesh.positions.len() / 3)
                .map(|i| {
                    model::ModelVertex {
                        position: [
                            m.mesh.positions[i * 3],
                            m.mesh.positions[i * 3 + 1],
                            m.mesh.positions[i * 3 + 2],
                        ],
                        tex_coords: [m.mesh.texcoords[i * 2], 1.0 - m.mesh.texcoords[i * 2 + 1]],
                        normal: [
                            m.mesh.normals[i * 3],
                            m.mesh.normals[i * 3 + 1],
                            m.mesh.normals[i * 3 + 2],
                        ],
                    }
                })
                .collect::<Vec<_>>();

            let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some(&format!("{:?} Vertex Buffer", file_name)),
                contents: bytemuck::cast_slice(&vertices),
                usage: wgpu::BufferUsages::VERTEX,
            });
            let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some(&format!("{:?} Index Buffer", file_name)),
                contents: bytemuck::cast_slice(&m.mesh.indices),
                usage: wgpu::BufferUsages::INDEX,
            });

            model::Mesh {
                name: file_name.to_string(),
                vertex_buffer,
                index_buffer,
                num_elements: m.mesh.indices.len() as u32,
                material: m.mesh.material_id.unwrap_or(0),
            }
        })
        .collect::<Vec<_>>();

    Ok(model::Model { meshes, materials })
}
```

*역자 주: 위 코드에서 `m.diffuse_texture`는 `Option<String>` 타입일 수 있으므로 `.unwrap()`을 추가해야 할 수 있습니다. 또한 `m.mesh.normals`가 비어있을 경우를 대비하여 `if/else` 분기를 추가하는 것이 안전합니다.*

```rust
// 수정 제안
let vertices = (0..m.mesh.positions.len() / 3)
    .map(|i| {
        if m.mesh.normals.is_empty() {
            model::ModelVertex {
                position: [
                    m.mesh.positions[i * 3],
                    m.mesh.positions[i * 3 + 1],
                    m.mesh.positions[i * 3 + 2],
                ],
                tex_coords: [m.mesh.texcoords[i * 2], 1.0 - m.mesh.texcoords[i * 2 + 1]],
                normal: [0.0, 0.0, 0.0],
            }
        } else {
            model::ModelVertex {
                position: [
                    m.mesh.positions[i * 3],
                    m.mesh.positions[i * 3 + 1],
                    m.mesh.positions[i * 3 + 2],
                ],
                tex_coords: [m.mesh.texcoords[i * 2], 1.0 - m.mesh.texcoords[i * 2 + 1]],
                normal: [
                    m.mesh.normals[i * 3],
                    m.mesh.normals[i * 3 + 1],
                    m.mesh.normals[i * 3 + 2],
                ],
            }
        }
    })
    .collect::<Vec<_>>();
```


## 메쉬 렌더링하기

모델을 그리기 전에, 개별 메쉬를 그릴 수 있어야 합니다. `DrawModel`이라는 트레이트를 만들고 `RenderPass`에 대해 구현해 봅시다.

```rust
// model.rs
use std::ops::Range;

//... 다른 struct 정의들

pub trait DrawModel<'a> {
    fn draw_mesh(&mut self, mesh: &'a Mesh);
    fn draw_mesh_instanced(
        &mut self,
        mesh: &'a Mesh,
        instances: Range<u32>,
    );
}
impl<'a, 'b> DrawModel<'b> for wgpu::RenderPass<'a>
where
    'b: 'a,
{
    fn draw_mesh(&mut self, mesh: &'b Mesh) {
        self.draw_mesh_instanced(mesh, 0..1);
    }

    fn draw_mesh_instanced(
        &mut self,
        mesh: &'b Mesh,
        instances: Range<u32>,
    ){
        self.set_vertex_buffer(0, mesh.vertex_buffer.slice(..));
        self.set_index_buffer(mesh.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
        self.draw_indexed(0..mesh.num_elements, 0, instances);
    }
}
```

이 메서드들을 `impl Model`에 넣을 수도 있었지만, 렌더링이 `RenderPass`의 역할이므로, `RenderPass`가 모든 렌더링을 수행하는 것이 더 합리적이라고 생각했습니다. 하지만 이것은 렌더링할 때 `DrawModel`을 가져와야 한다는 것을 의미합니다.

`vertex_buffer` 등을 제거했을 때, `render_pass` 설정도 함께 제거했습니다.

```rust
// lib.rs
render_pass.set_vertex_buffer(1, self.instance_buffer.slice(..));
render_pass.set_pipeline(&self.render_pipeline);
render_pass.set_bind_group(0, &self.diffuse_bind_group, &[]);
render_pass.set_bind_group(1, &self.camera_bind_group, &[]);

use model::DrawModel;
render_pass.draw_mesh_instanced(&self.obj_model.meshes[0], 0..self.instances.len() as u32);
```

하지만 그 전에, 모델을 로드하고 `State`에 저장해야 합니다. `State::new()`에 다음을 넣으세요.

```rust
let obj_model =
    resources::load_model("cube.obj", &device, &queue, &texture_bind_group_layout)
        .await
        .unwrap();
```

새 모델은 이전 모델보다 약간 크므로 인스턴스 간의 간격을 조정해야 합니다.

```rust
const SPACE_BETWEEN: f32 = 3.0;
let instances = (0..NUM_INSTANCES_PER_ROW).flat_map(|z| {
    (0..NUM_INSTANCES_PER_ROW).map(move |x| {
        let x = SPACE_BETWEEN * (x as f32 - NUM_INSTANCES_PER_ROW as f32 / 2.0);
        let z = SPACE_BETWEEN * (z as f32 - NUM_INSTANCES_PER_ROW as f32 / 2.0);

        let position = cgmath::Vector3 { x, y: 0.0, z };

        let rotation = if position.is_zero() {
            cgmath::Quaternion::from_axis_angle(cgmath::Vector3::unit_z(), cgmath::Deg(0.0))
        } else {
            cgmath::Quaternion::from_axis_angle(position.normalize(), cgmath::Deg(45.0))
        };

        Instance {
            position, rotation,
        }
    })
}).collect::<Vec<_>>();
```

이 모든 작업을 마치면 다음과 같은 결과물을 얻게 됩니다.

![cubes.png](./cubes.png)

## 올바른 텍스처 사용하기

obj의 텍스처 파일을 보면, 우리 obj와 일치하지 않는다는 것을 알 수 있습니다. 우리가 보고 싶은 텍스처는 이것입니다.

![cube-diffuse.jpg](./cube-diffuse.jpg)

하지만 우리는 여전히 행복한 나무 텍스처를 보고 있습니다.

그 이유는 매우 간단합니다. 텍스처는 만들었지만, `RenderPass`에 전달할 바인드 그룹을 만들지 않았기 때문입니다. 우리는 여전히 오래된 `diffuse_bind_group`을 사용하고 있습니다. 이를 변경하려면, 우리 머티리얼의 바인드 그룹, 즉 `Material` 구조체의 `bind_group` 멤버를 사용해야 합니다.

`DrawModel`에 머티리얼 파라미터를 추가할 것입니다.

```rust
pub trait DrawModel<'a> {
    fn draw_mesh(&mut self, mesh: &'a Mesh, material: &'a Material, camera_bind_group: &'a wgpu::BindGroup);
    fn draw_mesh_instanced(
        &mut self,
        mesh: &'a Mesh,
        material: &'a Material,
        instances: Range<u32>,
        camera_bind_group: &'a wgpu::BindGroup,
    );
}

impl<'a, 'b> DrawModel<'b> for wgpu::RenderPass<'a>
where
    'b: 'a,
{
    fn draw_mesh(&mut self, mesh: &'b Mesh, material: &'b Material, camera_bind_group: &'b wgpu::BindGroup) {
        self.draw_mesh_instanced(mesh, material, 0..1, camera_bind_group);
    }

    fn draw_mesh_instanced(
        &mut self,
        mesh: &'b Mesh,
        material: &'b Material,
        instances: Range<u32>,
        camera_bind_group: &'b wgpu::BindGroup,
    ) {
        self.set_vertex_buffer(0, mesh.vertex_buffer.slice(..));
        self.set_index_buffer(mesh.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
        self.set_bind_group(0, &material.bind_group, &[]);
        self.set_bind_group(1, camera_bind_group, &[]);
        self.draw_indexed(0..mesh.num_elements, 0, instances);
    }
}
```

이를 반영하여 렌더링 코드를 변경해야 합니다.

```rust
render_pass.set_vertex_buffer(1, self.instance_buffer.slice(..));

render_pass.set_pipeline(&self.render_pipeline);

let mesh = &self.obj_model.meshes[0];
let material = &self.obj_model.materials[mesh.material];
render_pass.draw_mesh_instanced(mesh, material, 0..self.instances.len() as u32, &self.camera_bind_group);
```

이 모든 것을 적용하면 다음과 같은 결과를 얻을 수 있습니다.

![cubes-correct.png](./cubes-correct.png)

## 전체 모델 렌더링하기

현재 우리는 메쉬와 머티리얼을 직접 지정하고 있습니다. 이것은 다른 머티리얼로 메쉬를 그리고 싶을 때 유용합니다. 또한 모델의 다른 부분(만약 있다면)은 렌더링하고 있지 않습니다. 이제 `DrawModel`에 모델의 모든 부분을 각자의 머티리얼로 그리는 메서드를 만들어 봅시다.

```rust
pub trait DrawModel<'a> {
    // ...
    fn draw_model(&mut self, model: &'a Model, camera_bind_group: &'a wgpu::BindGroup);
    fn draw_model_instanced(
        &mut self,
        model: &'a Model,
        instances: Range<u32>,
        camera_bind_group: &'a wgpu::BindGroup,
    );
}

impl<'a, 'b> DrawModel<'b> for wgpu::RenderPass<'a>
where
    'b: 'a, {
    // ...
    fn draw_model(&mut self, model: &'b Model, camera_bind_group: &'b wgpu::BindGroup) {
        self.draw_model_instanced(model, 0..1, camera_bind_group);
    }

    fn draw_model_instanced(
        &mut self,
        model: &'b Model,
        instances: Range<u32>,
        camera_bind_group: &'b wgpu::BindGroup,
    ) {
        for mesh in &model.meshes {
            let material = &model.materials[mesh.material];
            self.draw_mesh_instanced(mesh, material, instances.clone(), camera_bind_group);
        }
    }
}
```

`lib.rs`의 코드도 그에 맞게 변경될 것입니다.

```rust
render_pass.set_vertex_buffer(1, self.instance_buffer.slice(..));
render_pass.set_pipeline(&self.render_pipeline);
render_pass.draw_model_instanced(&self.obj_model, 0..self.instances.len() as u32, &self.camera_bind_group);
```

## 데모

<WasmExample example="tutorial9_models"></WasmExample>

<AutoGithubLink/>
