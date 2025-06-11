# Wgpu와 Rayon으로 멀티스레딩하기

<div class="warn">

이 예제는 WASM에서 테스트되지 않았습니다. Rayon은 [wasm-bindgen-rayon](https://docs.rs/crate/wasm-bindgen-rayon/latest)을 통해 WASM에서 멀티스레딩을 지원하지만, 해당 구현은 현재 Chrome 기반 브라우저에서만 작동합니다. 이러한 이유로, 현 시점에서는 이 튜토리얼의 WASM 버전을 만들지 않기로 결정했습니다.

</div>

Vulkan, DirectX 12, Metal, 그리고 이를 계승한 Wgpu의 핵심 장점은 이 API들이 처음부터 스레드에 안전하도록(thread safe) 설계되었다는 점입니다. 지금까지 우리는 모든 작업을 단일 스레드에서 수행해 왔습니다. 이제 그것을 바꿔보려 합니다.

<div class="note">

이 예제는 [tutorial12-camera](../intermediate/tutorial12-camera) 코드를 기반으로 합니다.

</div>

<div class="note">

이 튜토리얼에서는 스레드가 무엇인지에 대해 깊이 다루지 않을 것입니다. 그 자체만으로도 하나의 완전한 컴퓨터 과학(CS) 과정이기 때문입니다. 여기서 다룰 내용은 스레딩을 사용하여 리소스 로딩 속도를 높이는 것뿐입니다.

아직 렌더링할 객체의 종류가 충분하지 않기 때문에 멀티스레딩 렌더링은 다루지 않을 것입니다. 이는 다음 튜토리얼에서 바뀔 것입니다.

</div>

## 모델과 텍스처 로딩 병렬화하기

현재 우리는 모델의 재질(material)과 메시(mesh)를 한 번에 하나씩 로드하고 있습니다. 이는 멀티스레딩을 적용하기에 완벽한 기회입니다! 모든 변경 사항은 `model.rs` 파일에 적용됩니다. 먼저 재질부터 시작하겠습니다. 일반적인 for 루프를 `par_iter().map()`으로 변환할 것입니다.

```rust
// resources.rs

#[cfg(not(target_arch="wasm32"))]
use rayon::iter::IntoParallelIterator;

impl Model {
    pub fn load<P: AsRef<Path>>(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        layout: &wgpu::BindGroupLayout,
        path: P,
    ) -> Result<Self> {
        // ...
        // 변경됨!
        let materials = obj_materials.par_iter().map(|mat| {
            // 텍스처 로딩도 병렬화할 수 있습니다!
            let mut textures = [
                (containing_folder.join(&mat.diffuse_texture), false),
                (containing_folder.join(&mat.normal_texture), true),
            ].par_iter().map(|(texture_path, is_normal_map)| {
                texture::Texture::load(device, queue, texture_path, *is_normal_map)
            }).collect::<Result<Vec<_>>>()?;
            
            // pop은 리스트의 끝에서부터 요소를 제거합니다.
            let normal_texture = textures.pop().unwrap();
            let diffuse_texture = textures.pop().unwrap();

            Ok(Material::new(
                device,
                &mat.name,
                diffuse_texture,
                normal_texture,
                layout,
            ))
        }).collect::<Result<Vec<Material>>>()?;
        // ...
    }
    // ...
}
```

다음으로, 메시가 병렬로 로드되도록 업데이트할 수 있습니다.

```rust
impl Model {
    pub fn load<P: AsRef<Path>>(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        layout: &wgpu::BindGroupLayout,
        path: P,
    ) -> Result<Self> {
        // ...
        // 변경됨!
        let meshes = obj_models.par_iter().map(|m| {
            let mut vertices = (0..m.mesh.positions.len() / 3).into_par_iter().map(|i| {
                ModelVertex {
                    position: [
                        m.mesh.positions[i * 3],
                        m.mesh.positions[i * 3 + 1],
                        m.mesh.positions[i * 3 + 2],
                    ].into(),
                    tex_coords: [
                        m.mesh.texcoords[i * 2], 
                        m.mesh.texcoords[i * 2 + 1]
                    ].into(),
                    normal: [
                        m.mesh.normals[i * 3],
                        m.mesh.normals[i * 3 + 1],
                        m.mesh.normals[i * 3 + 2],
                    ].into(),
                    // 이 값들은 나중에 계산할 것입니다.
                    tangent: [0.0; 3].into(),
                    bitangent: [0.0; 3].into(),
                }
            }).collect::<Vec<_>>();
            // ...
            let index_buffer = device.create_buffer_init(
                &wgpu::util::BufferInitDescriptor {
                    label: Some(&format!("{:?} Index Buffer", m.name)), // 변경됨!
                    contents: bytemuck::cast_slice(&m.mesh.indices),
                    usage: wgpu::BufferUsages::INDEX,
                }
            );
            // ...
            // 변경됨!
            Ok(Mesh {
                // ...
            })
        }).collect::<Result<Vec<_>>>()?;
        // ...
    }
    // ...
}
```

메시 로딩과 그에 대한 정점(vertex) 배열 생성을 병렬화했습니다. 아마 약간 과한 최적화일 수도 있지만, `rayon`이 너무 많은 스레드를 사용하는 것을 막아줄 것입니다.

<div class="note">

탄젠트(tangent)와 바이탄젠트(bitangent)를 계산하는 데에는 `rayon`을 사용하지 않은 것을 눈치채셨을 겁니다. `vertices`에 대한 여러 개의 가변 참조(mutable references) 없이는 이를 처리할 방법을 찾기 어려워 작동시키려 노력했지만 잘 되지 않았습니다. `std::sync::Mutex`를 도입하고 싶지는 않아서 일단은 그대로 두겠습니다.

솔직히 이 작업은 컴퓨트 셰이더(compute shader)에 더 적합합니다. 어차피 모델 데이터는 버퍼에 로드될 것이기 때문입니다.

</div>

## 이렇게나 쉽습니다!

대부분의 `wgpu` 타입은 `Send + Sync`를 만족하므로, 별다른 어려움 없이 스레드에서 사용할 수 있습니다. 너무 쉬워서 튜토리얼이 너무 짧게 느껴질 정도입니다! 이전 모델 로딩 코드와 현재 코드의 속도 비교를 보여드리는 것으로 마무리하겠습니다.

```
경과 시간 (원본): 309.596382ms
경과 시간 (스레드 적용): 199.645027ms
```

아주 많은 리소스를 로딩하는 것이 아니므로 속도 향상은 미미합니다. 앞으로 스레딩으로 더 많은 작업을 하겠지만, 이것은 좋은 입문 과정입니다.

<!-- <WasmExample example="tutorial12_camera"></WasmExample> -->

<AutoGithubLink/>
